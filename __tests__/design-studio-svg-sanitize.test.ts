import { hrefAllowed, sanitizeCss, sanitizeSvg } from "@/lib/design-studio/svg-sanitize";

const SVG_NS = "http://www.w3.org/2000/svg";
const NS = `xmlns="${SVG_NS}"`;

function svg(body: string): string {
  return `<svg ${NS}>${body}</svg>`;
}

describe("sanitizeSvg — destructive elements", () => {
  it("removes <script> together with its content", () => {
    const result = sanitizeSvg(svg('<script>alert("pwned")</script><rect width="10" height="10"/>'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("script");
    expect(result.svg).not.toContain("alert");
    expect(result.svg).toContain("<rect");
    expect(result.changed).toBe(true);
  });

  it("drops denied elements and their whole subtree", () => {
    const result = sanitizeSvg(
      svg(
        '<foreignObject><div onclick="steal()">hello</div></foreignObject>' +
          '<rect width="5" height="5"/>'
      )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("foreignObject");
    expect(result.svg).not.toContain("div");
    expect(result.svg).not.toContain("hello");
    expect(result.svg).toContain("<rect");
  });

  it("removes SMIL animation elements", () => {
    const result = sanitizeSvg(svg('<animate attributeName="x" values="0;100"/><circle r="5"/>'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("animate");
    expect(result.svg).toContain("<circle");
  });

  it("keeps ordinary drawing content byte-for-byte usable", () => {
    const source = svg(
      '<g transform="translate(4,4)"><path d="M0 0 L10 10 Z" fill="#ff0066" stroke="none"/>' +
        '<text x="2" y="8" font-size="10">Galaxy</text></g>'
    );
    const result = sanitizeSvg(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('d="M0 0 L10 10 Z"');
    expect(result.svg).toContain('fill="#ff0066"');
    expect(result.svg).toContain("Galaxy");
    expect(result.svg).toContain('transform="translate(4,4)"');
  });
});

describe("sanitizeSvg — attributes", () => {
  it("strips every event handler", () => {
    const result = sanitizeSvg(
      svg('<rect width="10" height="10" onclick="hack()" onload="hack()" onmouseover="hack()"/>')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("onclick");
    expect(result.svg).not.toContain("onload");
    expect(result.svg).not.toContain("onmouseover");
    expect(result.svg).toContain('width="10"');
  });

  it("keeps local references and raster data URIs, drops external and JS references", () => {
    const result = sanitizeSvg(
      svg(
        '<a href="javascript:evil()"><text>x</text></a>' +
          '<image href="https://evil.example/track.png"/>' +
          '<image xlink:href="data:image/png;base64,iVBORw0KGgo="/>' +
          '<use xlink:href="#glyph"/>'
      )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("javascript:");
    expect(result.svg).not.toContain("evil.example");
    expect(result.svg).toContain('href="#glyph"');
    expect(result.svg).toContain("data:image/png;base64");
    // xmlns:xlink must be declared even though the source forgot it — a bare
    // xlink:href prefix would break XML parsing of the whole image.
    expect(result.svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  it("keeps the first of duplicate attributes (smuggling via duplication dies)", () => {
    const result = sanitizeSvg(svg('<rect width="10" width="9999" height="4"/>'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('width="10"');
    expect(result.svg).not.toContain("9999");
  });

  it("drops unknown attributes but keeps style after CSS sanitizing", () => {
    const result = sanitizeSvg(
      svg('<rect width="4" height="4" data-track="x" style="fill: red; behavior: url(x)"/>')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("data-track");
    expect(result.svg).toContain("fill: red");
    expect(result.svg).not.toContain("behavior");
  });

  it("rejects a foreign root xmlns instead of adopting it", () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://evil/ns"><rect width="1" height="1"/></svg>'
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain(`xmlns="${SVG_NS}"`);
    expect(result.svg).not.toContain("evil/ns");
    expect(result.svg).not.toContain("xhtml");
  });
});

describe("sanitizeSvg — XML dangers", () => {
  it("removes the DOCTYPE and never resolves its entities", () => {
    const source =
      '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      svg("&xxe;");
    const result = sanitizeSvg(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("ENTITY");
    expect(result.svg).not.toContain("file:///");
    // The reference renders as literal text — escaped, never expanded.
    expect(result.svg).toContain("&amp;xxe;");
  });

  it("round-trips predefined entities without double-escaping", () => {
    const result = sanitizeSvg(svg("<text>a &lt; b &amp; c &gt; d</text>"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain("a &lt; b &amp; c &gt; d");
  });

  it("strips comments (they cannot hide content)", () => {
    const result = sanitizeSvg(`<!-- <script>hidden()</script> -->${svg("")}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("hidden");
    expect(result.svg).not.toContain("<!--");
  });

  it("sanitizes <style> blocks: no @import, no external urls, real CSS kept", () => {
    const result = sanitizeSvg(
      svg(
        "<style>@import url('https://evil/x.css');" +
          ".a { fill: red; background: url(https://evil/i.png); color: blue; }</style>" +
          '<rect class="a" width="2" height="2"/>'
      )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("@import");
    expect(result.svg).not.toContain("evil/");
    expect(result.svg).toContain("about:invalid");
    expect(result.svg).toContain("fill: red");
    expect(result.svg).toContain("color: blue");
  });

  it("neutralises url() pointing at script-ish schemes in style attributes", () => {
    const result = sanitizeSvg(
      svg('<rect width="4" height="4" style="background: url(javascript:alert(1))"/>')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("javascript:");
  });
});

describe("sanitizeSvg — document structure", () => {
  it("rejects non-SVG documents", () => {
    expect(sanitizeSvg("<html><body>hi</body></html>")).toMatchObject({ ok: false, code: "not_svg" });
    expect(sanitizeSvg("plain text")).toMatchObject({ ok: false, code: "not_svg" });
    expect(sanitizeSvg("")).toMatchObject({ ok: false, code: "not_svg" });
  });

  it("injects the SVG namespace when the source omits it", () => {
    const result = sanitizeSvg("<svg><rect width='1' height='1'/></svg>");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain(`xmlns="${SVG_NS}"`);
  });

  it("closes tags the source left open", () => {
    const result = sanitizeSvg("<svg><g><rect width='1' height='1'/>");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.endsWith("</g></svg>")).toBe(true);
  });

  it("treats a bare '<' as text instead of losing content", () => {
    const result = sanitizeSvg(svg("<text>5 < 10</text>"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain("5 &lt; 10");
  });

  it("reports changed=false for input that already matches the output form", () => {
    const clean = `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="10" height="10" /></svg>`;
    const result = sanitizeSvg(clean);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(result.svg).toBe(clean);
  });

  it("enforces the SVG size cap", () => {
    const huge = `<svg ${NS}>${"a".repeat(2 * 1024 * 1024 + 10)}</svg>`;
    const result = sanitizeSvg(huge);
    expect(result).toMatchObject({ ok: false, code: "svg_too_large" });
  });
});

describe("sanitizeSvg — helpers", () => {
  it("hrefAllowed: fragments and raster data URIs only", () => {
    expect(hrefAllowed("#local")).toBe(true);
    expect(hrefAllowed("data:image/webp;base64,AAAA")).toBe(true);
    expect(hrefAllowed("https://example.com/x.svg")).toBe(false);
    expect(hrefAllowed("//example.com")).toBe(false);
    expect(hrefAllowed("data:text/html;base64,AAAA")).toBe(false);
    expect(hrefAllowed("javascript:alert(1)")).toBe(false);
  });

  it("sanitizeCss keeps paint rules but kills loads and script vectors", () => {
    const out = sanitizeCss(
      "@import 'x.css'; color: blue; background: url(#grad); mask: url(https://x/y.png); width: expression(alert(1));"
    );
    expect(out).not.toContain("@import");
    expect(out).not.toContain("https://x/y.png");
    expect(out).not.toContain("expression(");
    expect(out).toContain("url(#grad)");
    expect(out).toContain("color: blue");
  });
});
