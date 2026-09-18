export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _seed_report: {
        Row: {
          created_at: string
          detail: string | null
          id: number
          section: string
          status: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: number
          section: string
          status: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: number
          section?: string
          status?: string
        }
        Relationships: []
      }
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          is_default: boolean
          label: string | null
          line1: string
          line2: string | null
          phone: string | null
          postal_code: string
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          phone?: string | null
          postal_code: string
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          phone?: string | null
          postal_code?: string
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_at: string
          cart_id: string
          color: string | null
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          is_saved_for_later: boolean
          quantity: number
          reserved_until: string | null
          size: string | null
          unit_price_snapshot: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          added_at?: string
          cart_id: string
          color?: string | null
          customization_id?: string | null
          gift_note?: string | null
          id?: string
          is_gift_wrapped?: boolean
          is_saved_for_later?: boolean
          quantity: number
          reserved_until?: string | null
          size?: string | null
          unit_price_snapshot: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          added_at?: string
          cart_id?: string
          color?: string | null
          customization_id?: string | null
          gift_note?: string | null
          id?: string
          is_gift_wrapped?: boolean
          is_saved_for_later?: boolean
          quantity?: number
          reserved_until?: string | null
          size?: string | null
          unit_price_snapshot?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_totals"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: true
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      carts: {
        Row: {
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          discount_amount: number
          expires_at: string | null
          id: string
          last_activity_at: string
          merged_into_cart_id: string | null
          owner_id: string | null
          session_token: string | null
          status: string
          updated_at: string
        }
        Insert: {
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string | null
          id?: string
          last_activity_at?: string
          merged_into_cart_id?: string | null
          owner_id?: string | null
          session_token?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string | null
          id?: string
          last_activity_at?: string
          merged_into_cart_id?: string | null
          owner_id?: string | null
          session_token?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "admin_coupon_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "admin_mv_coupon_performance"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "mv_coupon_performance"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "carts_merged_into_cart_id_fkey"
            columns: ["merged_into_cart_id"]
            isOneToOne: false
            referencedRelation: "cart_totals"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "carts_merged_into_cart_id_fkey"
            columns: ["merged_into_cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          level: number
          name: string
          parent_id: string | null
          path: unknown
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          level?: number
          name: string
          parent_id?: string | null
          path?: unknown
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          path?: unknown
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vendor_sales_by_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_discount_amount: number | null
          max_uses: number | null
          max_uses_per_user: number | null
          min_order_amount: number | null
          starts_at: string | null
          type: string
          updated_at: string
          used_count: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order_amount?: number | null
          starts_at?: string | null
          type: string
          updated_at?: string
          used_count?: number
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order_amount?: number | null
          starts_at?: string | null
          type?: string
          updated_at?: string
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      design_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      design_files: {
        Row: {
          checksum_sha256: string | null
          color_mode: string | null
          created_at: string
          dpi: number | null
          file_format: Database["public"]["Enums"]["design_file_format"]
          file_size_bytes: number
          has_transparent_background: boolean | null
          height_px: number | null
          id: string
          is_primary: boolean
          mime_type: string
          original_filename: string
          scan_status: string
          scanned_at: string | null
          storage_path: string
          version_id: string
          width_px: number | null
        }
        Insert: {
          checksum_sha256?: string | null
          color_mode?: string | null
          created_at?: string
          dpi?: number | null
          file_format: Database["public"]["Enums"]["design_file_format"]
          file_size_bytes: number
          has_transparent_background?: boolean | null
          height_px?: number | null
          id?: string
          is_primary?: boolean
          mime_type: string
          original_filename: string
          scan_status?: string
          scanned_at?: string | null
          storage_path: string
          version_id: string
          width_px?: number | null
        }
        Update: {
          checksum_sha256?: string | null
          color_mode?: string | null
          created_at?: string
          dpi?: number | null
          file_format?: Database["public"]["Enums"]["design_file_format"]
          file_size_bytes?: number
          has_transparent_background?: boolean | null
          height_px?: number | null
          id?: string
          is_primary?: boolean
          mime_type?: string
          original_filename?: string
          scan_status?: string
          scanned_at?: string | null
          storage_path?: string
          version_id?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_files_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "admin_design_moderation_queue"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "design_files_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      design_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          design_id: string
          id: string
          new_status: Database["public"]["Enums"]["design_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["design_status"] | null
          version_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          design_id: string
          id?: string
          new_status: Database["public"]["Enums"]["design_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["design_status"] | null
          version_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          design_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["design_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["design_status"] | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_status_history_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "user_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_status_history_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["design_id"]
          },
          {
            foreignKeyName: "design_status_history_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "admin_design_moderation_queue"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "design_status_history_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      design_versions: {
        Row: {
          created_at: string
          design_id: string
          id: string
          is_current: boolean
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["design_status"]
          submitted_at: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          design_id: string
          id?: string
          is_current?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["design_status"]
          submitted_at?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          design_id?: string
          id?: string
          is_current?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["design_status"]
          submitted_at?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_versions_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "user_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_versions_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["design_id"]
          },
          {
            foreignKeyName: "design_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "design_versions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fonts: {
        Row: {
          category: string
          created_at: string
          family: string
          id: string
          is_active: boolean
          name: string
          slug: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          family: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          family?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          channel: string
          claimed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          notification_id: string
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          claimed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          claimed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: string
          created_at: string
          event_type: string
          id: string
          is_active: boolean
          subject_template: string | null
          updated_at: string
        }
        Insert: {
          body_template: string
          channel: string
          created_at?: string
          event_type: string
          id?: string
          is_active?: boolean
          subject_template?: string | null
          updated_at?: string
        }
        Update: {
          body_template?: string
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          subject_template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          data: Json
          event_type: string
          id: string
          is_read: boolean
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["order_item_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["order_item_status"] | null
          order_item_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["order_item_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["order_item_status"] | null
          order_item_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["order_item_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["order_item_status"] | null
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_item_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_status_history_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          line_total: number
          options_snapshot: Json | null
          order_id: string
          printing_instructions: string | null
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          status: Database["public"]["Enums"]["order_item_status"]
          unit_price_snapshot: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          customization_id?: string | null
          gift_note?: string | null
          id?: string
          is_gift_wrapped?: boolean
          line_total: number
          options_snapshot?: Json | null
          order_id: string
          printing_instructions?: string | null
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price_snapshot: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          customization_id?: string | null
          gift_note?: string | null
          id?: string
          is_gift_wrapped?: boolean
          line_total?: number
          options_snapshot?: Json | null
          order_id?: string
          printing_instructions?: string | null
          product_name_snapshot?: string
          quantity?: number
          sku_snapshot?: string
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price_snapshot?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: false
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["order_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["order_status"] | null
          order_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["order_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["order_status"] | null
          order_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["order_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["order_status"] | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address_snapshot: Json | null
          cart_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          customer_note: string | null
          deleted_at: string | null
          discount_amount: number
          gift_note: string | null
          gift_wrap: boolean
          gift_wrap_fee: number
          id: string
          internal_note: string | null
          order_number: string
          placed_at: string
          shipping_address_snapshot: Json
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_address_snapshot?: Json | null
          cart_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          customer_note?: string | null
          deleted_at?: string | null
          discount_amount?: number
          gift_note?: string | null
          gift_wrap?: boolean
          gift_wrap_fee?: number
          id?: string
          internal_note?: string | null
          order_number: string
          placed_at?: string
          shipping_address_snapshot: Json
          shipping_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_address_snapshot?: Json | null
          cart_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency?: string
          customer_note?: string | null
          deleted_at?: string | null
          discount_amount?: number
          gift_note?: string | null
          gift_wrap?: boolean
          gift_wrap_fee?: number
          id?: string
          internal_note?: string | null
          order_number?: string
          placed_at?: string
          shipping_address_snapshot?: Json
          shipping_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_totals"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "admin_coupon_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "admin_mv_coupon_performance"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "mv_coupon_performance"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_type: string
          id: string
          payload: Json
          payment_id: string | null
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id: string | null
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          event_type: string
          id?: string
          payload: Json
          payment_id?: string | null
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string | null
          received_at?: string
          signature_verified?: boolean
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string | null
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          created_at: string
          created_by: string | null
          event: string
          id: string
          metadata: Json | null
          new_status: string | null
          old_status: string | null
          payment_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          payment_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_retries: {
        Row: {
          attempt_number: number
          attempted_at: string
          error_message: string | null
          id: string
          payment_id: string
          provider_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          error_message?: string | null
          id?: string
          payment_id: string
          provider_response?: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          error_message?: string | null
          id?: string
          payment_id?: string
          provider_response?: Json | null
          status?: Database["public"]["Enums"]["payment_transaction_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_retries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          attempt_number?: number
          authorized_at?: string | null
          captured_at?: string | null
          client_secret?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          attempt_number?: number
          authorized_at?: string | null
          captured_at?: string | null
          client_secret?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          payout_id: string
          vendor_earning_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payout_id: string
          vendor_earning_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payout_id?: string
          vendor_earning_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_transactions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "vendor_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_transactions_vendor_earning_id_fkey"
            columns: ["vendor_earning_id"]
            isOneToOne: false
            referencedRelation: "vendor_earnings"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_locations: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          opening_hours: Json | null
          phone: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          opening_hours?: Json | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      print_jobs: {
        Row: {
          assigned_to: string | null
          attempt_number: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          notes: string | null
          order_item_id: string
          printer_id: string | null
          reprint_count: number
          started_at: string | null
          status: string
          store_id: string | null
          timeout_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          notes?: string | null
          order_item_id: string
          printer_id?: string | null
          reprint_count?: number
          started_at?: string | null
          status?: string
          store_id?: string | null
          timeout_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          notes?: string | null
          order_item_id?: string
          printer_id?: string | null
          reprint_count?: number
          started_at?: string | null
          status?: string
          store_id?: string | null
          timeout_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      printers: {
        Row: {
          created_at: string
          id: string
          last_heartbeat_at: string | null
          name: string
          offline_threshold_seconds: number
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_heartbeat_at?: string | null
          name: string
          offline_threshold_seconds?: number
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_heartbeat_at?: string | null
          name?: string
          offline_threshold_seconds?: number
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          color_hex: string | null
          created_at: string
          id: string
          slug: string
          sort_order: number
          value: string
        }
        Insert: {
          attribute_id: string
          color_hex?: string | null
          created_at?: string
          id?: string
          slug: string
          sort_order?: number
          value: string
        }
        Update: {
          attribute_id?: string
          color_hex?: string | null
          created_at?: string
          id?: string
          slug?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          created_at: string
          id: string
          input_type: string
          is_variant_defining: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_type?: string
          is_variant_defining?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input_type?: string
          is_variant_defining?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_collection_items: {
        Row: {
          collection_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_customization_areas: {
        Row: {
          bleed_mm: number
          canvas_height_px: number
          canvas_width_px: number
          created_at: string
          deleted_at: string | null
          dpi: number
          id: string
          is_active: boolean
          max_layers: number
          mockup_image_url: string | null
          name: string
          printing_area_height: number
          printing_area_width: number
          printing_area_x: number
          printing_area_y: number
          product_id: string
          safe_area_height: number
          safe_area_width: number
          safe_area_x: number
          safe_area_y: number
          slug: string
          sort_order: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          bleed_mm?: number
          canvas_height_px: number
          canvas_width_px: number
          created_at?: string
          deleted_at?: string | null
          dpi?: number
          id?: string
          is_active?: boolean
          max_layers?: number
          mockup_image_url?: string | null
          name: string
          printing_area_height: number
          printing_area_width: number
          printing_area_x?: number
          printing_area_y?: number
          product_id: string
          safe_area_height: number
          safe_area_width: number
          safe_area_x: number
          safe_area_y: number
          slug: string
          sort_order?: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          bleed_mm?: number
          canvas_height_px?: number
          canvas_width_px?: number
          created_at?: string
          deleted_at?: string | null
          dpi?: number
          id?: string
          is_active?: boolean
          max_layers?: number
          mockup_image_url?: string | null
          name?: string
          printing_area_height?: number
          printing_area_width?: number
          printing_area_x?: number
          printing_area_y?: number
          product_id?: string
          safe_area_height?: number
          safe_area_width?: number
          safe_area_x?: number
          safe_area_y?: number
          slug?: string
          sort_order?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customization_areas_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_customization_areas_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_customization_areas_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_customization_areas_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customization_areas_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_customization_layers: {
        Row: {
          area_id: string
          created_at: string
          customization_id: string
          design_id: string | null
          font_id: string | null
          font_size: number | null
          height_px: number | null
          id: string
          is_locked: boolean
          layer_type: string
          opacity: number
          position_x: number
          position_y: number
          rotation_deg: number
          scale: number
          text_align: string | null
          text_color: string | null
          text_content: string | null
          updated_at: string
          width_px: number | null
          z_index: number
        }
        Insert: {
          area_id: string
          created_at?: string
          customization_id: string
          design_id?: string | null
          font_id?: string | null
          font_size?: number | null
          height_px?: number | null
          id?: string
          is_locked?: boolean
          layer_type: string
          opacity?: number
          position_x?: number
          position_y?: number
          rotation_deg?: number
          scale?: number
          text_align?: string | null
          text_color?: string | null
          text_content?: string | null
          updated_at?: string
          width_px?: number | null
          z_index?: number
        }
        Update: {
          area_id?: string
          created_at?: string
          customization_id?: string
          design_id?: string | null
          font_id?: string | null
          font_size?: number | null
          height_px?: number | null
          id?: string
          is_locked?: boolean
          layer_type?: string
          opacity?: number
          position_x?: number
          position_y?: number
          rotation_deg?: number
          scale?: number
          text_align?: string | null
          text_color?: string | null
          text_content?: string | null
          updated_at?: string
          width_px?: number | null
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_customization_layers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "product_customization_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customization_layers_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: false
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customization_layers_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "user_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customization_layers_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["design_id"]
          },
          {
            foreignKeyName: "product_customization_layers_font_id_fkey"
            columns: ["font_id"]
            isOneToOne: false
            referencedRelation: "fonts"
            referencedColumns: ["id"]
          },
        ]
      }
      product_customizations: {
        Row: {
          cart_item_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          order_item_id: string | null
          owner_id: string
          preview_image_url: string | null
          preview_settings: Json
          product_id: string
          status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          cart_item_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          order_item_id?: string | null
          owner_id: string
          preview_image_url?: string | null
          preview_settings?: Json
          product_id: string
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          cart_item_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          order_item_id?: string | null
          owner_id?: string
          preview_image_url?: string | null
          preview_settings?: Json
          product_id?: string
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_customization_cart_item"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "cart_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customization_cart_item"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customization_order_item"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "fk_customization_order_item"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "fk_customization_order_item"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customization_order_item"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customization_order_item"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "product_customizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "product_customizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "product_customizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_customizations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_customizations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_customizations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_customizations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customizations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          storage_path: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          storage_path: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          storage_path?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_options: {
        Row: {
          attribute_value_id: string
          variant_id: string
        }
        Insert: {
          attribute_value_id: string
          variant_id: string
        }
        Update: {
          attribute_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_options_attribute_value_id_fkey"
            columns: ["attribute_value_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_options_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_variant_options_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_variant_options_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_variant_options_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_options_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          created_at: string
          deleted_at: string | null
          height_cm: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_default: boolean
          length_cm: number | null
          low_stock_threshold: number | null
          price: number
          product_id: string
          reserved_quantity: number
          sku: string
          stock_quantity: number
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          deleted_at?: string | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_default?: boolean
          length_cm?: number | null
          low_stock_threshold?: number | null
          price: number
          product_id: string
          reserved_quantity?: number
          sku: string
          stock_quantity?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          deleted_at?: string | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_default?: boolean
          length_cm?: number | null
          low_stock_threshold?: number | null
          price?: number
          product_id?: string
          reserved_quantity?: number
          sku?: string
          stock_quantity?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          available_colors: string[]
          avg_rating: number
          base_price: number
          brand_id: string | null
          category_id: string | null
          color: string | null
          compare_at_price: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          height_cm: number | null
          id: string
          is_featured: boolean
          length_cm: number | null
          low_stock_threshold: number
          name: string
          published_at: string | null
          rating_count: number
          search_vector: unknown
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          short_description: string | null
          slug: string
          specifications: Json
          status: Database["public"]["Enums"]["product_status"]
          store_id: string | null
          updated_at: string
          view_count: number
          visibility: Database["public"]["Enums"]["product_visibility"]
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          available_colors?: string[]
          avg_rating?: number
          base_price: number
          brand_id?: string | null
          category_id?: string | null
          color?: string | null
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          height_cm?: number | null
          id?: string
          is_featured?: boolean
          length_cm?: number | null
          low_stock_threshold?: number
          name: string
          published_at?: string | null
          rating_count?: number
          search_vector?: unknown
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          short_description?: string | null
          slug: string
          specifications?: Json
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string | null
          updated_at?: string
          view_count?: number
          visibility?: Database["public"]["Enums"]["product_visibility"]
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          available_colors?: string[]
          avg_rating?: number
          base_price?: number
          brand_id?: string | null
          category_id?: string | null
          color?: string | null
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          height_cm?: number | null
          id?: string
          is_featured?: boolean
          length_cm?: number | null
          low_stock_threshold?: number
          name?: string
          published_at?: string | null
          rating_count?: number
          search_vector?: unknown
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          short_description?: string | null
          slug?: string
          specifications?: Json
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string | null
          updated_at?: string
          view_count?: number
          visibility?: Database["public"]["Enums"]["product_visibility"]
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_sales_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_address_id: string | null
          deleted_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_address_id?: string | null
          deleted_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_address_id?: string | null
          deleted_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_default_address"
            columns: ["default_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          is_active: boolean
          last_used_at: string
          platform: string
          push_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string
          platform: string
          push_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string
          platform?: string
          push_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed_products: {
        Row: {
          first_viewed_at: string
          id: string
          last_viewed_at: string
          product_id: string
          session_token: string | null
          user_id: string | null
          view_count: number
        }
        Insert: {
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          product_id: string
          session_token?: string | null
          user_id?: string | null
          view_count?: number
        }
        Update: {
          first_viewed_at?: string
          id?: string
          last_viewed_at?: string
          product_id?: string
          session_token?: string | null
          user_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recently_viewed_products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "recently_viewed_products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          payment_id: string | null
          processed_by: string | null
          provider_refund_id: string | null
          reason: string
          return_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          payment_id?: string | null
          processed_by?: string | null
          provider_refund_id?: string | null
          reason: string
          return_id?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          payment_id?: string | null
          processed_by?: string | null
          provider_refund_id?: string | null
          reason?: string
          return_id?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          reason: string | null
          return_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          reason?: string | null
          return_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          reason?: string | null
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          id: string
          order_id: string
          reason: string
          requested_by: string
          resolution_note: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          reason: string
          requested_by: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          reason?: string
          requested_by?: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "returns_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "returns_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_media: {
        Row: {
          created_at: string
          id: string
          media_type: string
          review_id: string
          sort_order: number
          storage_path: string
          thumbnail_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          review_id: string
          sort_order?: number
          storage_path: string
          thumbnail_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          review_id?: string
          sort_order?: number
          storage_path?: string
          thumbnail_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "admin_reviews_moderation_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_detailed"
            referencedColumns: ["id"]
          },
        ]
      }
      review_replies: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          is_seller_reply: boolean
          parent_reply_id: string | null
          review_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_seller_reply?: boolean
          parent_reply_id?: string | null
          review_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_seller_reply?: boolean
          parent_reply_id?: string | null
          review_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "review_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "admin_reviews_moderation_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_by: string
          review_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_by: string
          review_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_by?: string
          review_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "admin_reviews_moderation_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "admin_reviews_moderation_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          deleted_at: string | null
          helpful_count: number
          id: string
          is_verified_purchase: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          not_helpful_count: number
          order_item_id: string | null
          product_id: string
          rating: number
          report_count: number
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          helpful_count?: number
          id?: string
          is_verified_purchase?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          not_helpful_count?: number
          order_item_id?: string | null
          product_id: string
          rating: number
          report_count?: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          helpful_count?: number
          id?: string
          is_verified_purchase?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          not_helpful_count?: number
          order_item_id?: string | null
          product_id?: string
          rating?: number
          report_count?: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          clicked_product_id: string | null
          created_at: string
          id: string
          normalized_query: string | null
          query: string
          result_count: number
          session_token: string | null
          user_id: string | null
        }
        Insert: {
          clicked_product_id?: string | null
          created_at?: string
          id?: string
          normalized_query?: string | null
          query: string
          result_count?: number
          session_token?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_product_id?: string | null
          created_at?: string
          id?: string
          normalized_query?: string | null
          query?: string
          result_count?: number
          session_token?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_items: {
        Row: {
          id: string
          order_item_id: string
          quantity: number
          shipment_id: string
        }
        Insert: {
          id?: string
          order_item_id: string
          quantity: number
          shipment_id: string
        }
        Update: {
          id?: string
          order_item_id?: string
          quantity?: number
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_tracking"
            referencedColumns: ["shipment_id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_shipments"
            referencedColumns: ["shipment_id"]
          },
        ]
      }
      shipment_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["shipment_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["shipment_status"] | null
          shipment_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["shipment_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["shipment_status"] | null
          shipment_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["shipment_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["shipment_status"] | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "shipment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "shipment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_status_history_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment_tracking"
            referencedColumns: ["shipment_id"]
          },
          {
            foreignKeyName: "shipment_status_history_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_status_history_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_shipments"
            referencedColumns: ["shipment_id"]
          },
        ]
      }
      shipments: {
        Row: {
          actual_delivery_date: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          estimated_delivery_date_max: string | null
          estimated_delivery_date_min: string | null
          id: string
          notes: string | null
          order_id: string
          pickup_location_id: string | null
          recipient_signature: string | null
          shipped_at: string | null
          shipping_fee_charged: number
          shipping_method_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          actual_delivery_date?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery_date_max?: string | null
          estimated_delivery_date_min?: string | null
          id?: string
          notes?: string | null
          order_id: string
          pickup_location_id?: string | null
          recipient_signature?: string | null
          shipped_at?: string | null
          shipping_fee_charged?: number
          shipping_method_id: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          actual_delivery_date?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery_date_max?: string | null
          estimated_delivery_date_min?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          pickup_location_id?: string | null
          recipient_signature?: string | null
          shipped_at?: string | null
          shipping_fee_charged?: number
          shipping_method_id?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          carrier: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          max_delivery_days: number
          min_delivery_days: number
          name: string
          requires_address: boolean
          slug: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_delivery_days: number
          min_delivery_days?: number
          name: string
          requires_address?: boolean
          slug: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_delivery_days?: number
          min_delivery_days?: number
          name?: string
          requires_address?: boolean
          slug?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_rates: {
        Row: {
          base_fee: number
          created_at: string
          free_shipping_threshold: number | null
          id: string
          is_active: boolean
          method_id: string
          per_kg_fee: number
          updated_at: string
          zone_id: string
        }
        Insert: {
          base_fee?: number
          created_at?: string
          free_shipping_threshold?: number | null
          id?: string
          is_active?: boolean
          method_id: string
          per_kg_fee?: number
          updated_at?: string
          zone_id: string
        }
        Update: {
          base_fee?: number
          created_at?: string
          free_shipping_threshold?: number | null
          id?: string
          is_active?: boolean
          method_id?: string
          per_kg_fee?: number
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rates_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          countries: string[]
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          countries?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          countries?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_numbers: {
        Row: {
          created_at: string
          id: string
          is_verified: boolean
          phone_number: string
          updated_at: string
          user_id: string
          verification_code: string | null
          verification_expires_at: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_verified?: boolean
          phone_number: string
          updated_at?: string
          user_id: string
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_verified?: boolean
          phone_number?: string
          updated_at?: string
          user_id?: string
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_numbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_numbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_numbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sms_numbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_designs: {
        Row: {
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          download_count: number
          id: string
          is_public: boolean
          owner_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          status: Database["public"]["Enums"]["design_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          download_count?: number
          id?: string
          is_public?: boolean
          owner_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          status?: Database["public"]["Enums"]["design_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          download_count?: number
          id?: string
          is_public?: boolean
          owner_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["design_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_designs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "design_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_designs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_designs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_commissions: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          is_active: boolean
          notes: string | null
          rate_percent: number
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          rate_percent: number
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          rate_percent?: number
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_commissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_commissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_earnings: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          gross_amount: number
          id: string
          net_amount: number
          order_id: string
          order_item_id: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string
          currency?: string
          gross_amount: number
          id?: string
          net_amount: number
          order_id: string
          order_item_id: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: string
          order_item_id?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_earnings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "vendor_earnings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_earnings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_payout_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          rejection_reason: string | null
          requested_amount: number
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          requested_amount: number
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          requested_amount?: number
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payout_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          payout_method: string | null
          payout_request_id: string | null
          processed_at: string | null
          processed_by: string | null
          provider_reference: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          payout_method?: string | null
          payout_request_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          provider_reference?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          payout_method?: string | null
          payout_request_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          provider_reference?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payouts_payout_request_id_fkey"
            columns: ["payout_request_id"]
            isOneToOne: false
            referencedRelation: "vendor_payout_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payouts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendor_payouts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payouts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendor_payouts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payouts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payouts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          payment_id: string | null
          reason: string
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          payment_id?: string | null
          reason: string
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          payment_id?: string | null
          reason?: string
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          added_at: string
          customization_id: string | null
          id: string
          note: string | null
          sort_order: number
          variant_id: string
          wishlist_id: string
        }
        Insert: {
          added_at?: string
          customization_id?: string | null
          id?: string
          note?: string | null
          sort_order?: number
          variant_id: string
          wishlist_id: string
        }
        Update: {
          added_at?: string
          customization_id?: string | null
          id?: string
          note?: string | null
          sort_order?: number
          variant_id?: string
          wishlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: true
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_wishlist_id_fkey"
            columns: ["wishlist_id"]
            isOneToOne: false
            referencedRelation: "wishlists"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          owner_id: string
          share_token: string
          slug: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          owner_id: string
          share_token?: string
          slug: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          owner_id?: string
          share_token?: string
          slug?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wishlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wishlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_coupon_performance: {
        Row: {
          code: string | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          max_uses: number | null
          orders_count: number | null
          total_discount_given: number | null
          total_revenue_from_orders: number | null
          type: string | null
          used_count: number | null
          value: number | null
        }
        Relationships: []
      }
      admin_customer_ltv: {
        Row: {
          avg_order_value: number | null
          first_order_at: string | null
          full_name: string | null
          last_order_at: string | null
          lifetime_value: number | null
          order_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      admin_customers_overview: {
        Row: {
          full_name: string | null
          id: string | null
          joined_at: string | null
          last_order_at: string | null
          lifetime_value: number | null
          order_count: number | null
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      admin_daily_sales: {
        Row: {
          gross_revenue: number | null
          net_revenue: number | null
          order_count: number | null
          refunded_amount: number | null
          sale_date: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      admin_design_moderation_queue: {
        Row: {
          all_files_clean: boolean | null
          design_id: string | null
          file_count: number | null
          owner_id: string | null
          owner_name: string | null
          status: Database["public"]["Enums"]["design_status"] | null
          submitted_at: string | null
          title: string | null
          version_id: string | null
          version_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_versions_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "user_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_versions_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["design_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_inventory_status: {
        Row: {
          available_stock: number | null
          is_low_stock: boolean | null
          low_stock_threshold: number | null
          product_id: string | null
          product_name: string | null
          product_status: Database["public"]["Enums"]["product_status"] | null
          reserved_quantity: number | null
          sku: string | null
          stock_quantity: number | null
          variant_id: string | null
        }
        Relationships: []
      }
      admin_mv_coupon_performance: {
        Row: {
          code: string | null
          coupon_id: string | null
          is_active: boolean | null
          max_uses: number | null
          orders_count: number | null
          revenue_influenced: number | null
          total_discount_given: number | null
          type: string | null
          used_count: number | null
          value: number | null
        }
        Relationships: []
      }
      admin_orders_overview: {
        Row: {
          amount_paid: number | null
          amount_refunded: number | null
          currency: string | null
          customer_name: string | null
          id: string | null
          item_count: number | null
          order_number: string | null
          placed_at: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_printing_queue: {
        Row: {
          customization_id: string | null
          customization_preview_url: string | null
          item_status: Database["public"]["Enums"]["order_item_status"] | null
          order_id: string | null
          order_item_id: string | null
          order_number: string | null
          placed_at: string | null
          printing_instructions: string | null
          product_name_snapshot: string | null
          quantity: number | null
          sku_snapshot: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: false
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_product_performance: {
        Row: {
          avg_rating: number | null
          current_stock: number | null
          name: string | null
          product_id: string | null
          rating_count: number | null
          revenue: number | null
          slug: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          units_sold: number | null
        }
        Relationships: []
      }
      admin_reviews_moderation_queue: {
        Row: {
          created_at: string | null
          id: string | null
          product_id: string | null
          product_name: string | null
          rating: number | null
          report_count: number | null
          reviewer_name: string | null
          status: Database["public"]["Enums"]["review_status"] | null
          title: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items_detailed: {
        Row: {
          added_at: string | null
          available_stock: number | null
          cart_id: string | null
          color: string | null
          current_price: number | null
          customization_id: string | null
          customization_name: string | null
          customization_preview_url: string | null
          id: string | null
          is_saved_for_later: boolean | null
          line_total: number | null
          price_changed_since_added: boolean | null
          product_id: string | null
          product_image: string | null
          product_name: string | null
          product_slug: string | null
          quantity: number | null
          reserved_quantity: number | null
          reserved_until: string | null
          size: string | null
          sku: string | null
          stock_quantity: number | null
          unit_price_snapshot: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_totals"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: true
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      cart_totals: {
        Row: {
          cart_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          currency: string | null
          discount_amount: number | null
          item_count: number | null
          owner_id: string | null
          saved_for_later_count: number | null
          status: string | null
          subtotal: number | null
          total: number | null
          total_quantity: number | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "admin_coupon_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "admin_mv_coupon_performance"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "mv_coupon_performance"
            referencedColumns: ["coupon_id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "carts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      low_stock_variants: {
        Row: {
          product_id: string | null
          product_name: string | null
          reserved_quantity: number | null
          sku: string | null
          stock_quantity: number | null
          store_id: string | null
          threshold: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      mv_coupon_performance: {
        Row: {
          code: string | null
          coupon_id: string | null
          is_active: boolean | null
          max_uses: number | null
          orders_count: number | null
          revenue_influenced: number | null
          total_discount_given: number | null
          type: string | null
          used_count: number | null
          value: number | null
        }
        Relationships: []
      }
      mv_customer_ltv: {
        Row: {
          avg_order_value: number | null
          first_order_at: string | null
          full_name: string | null
          last_order_at: string | null
          lifetime_value: number | null
          order_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      mv_daily_sales: {
        Row: {
          gross_revenue: number | null
          net_revenue: number | null
          order_count: number | null
          refunded_amount: number | null
          sale_date: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      mv_product_performance: {
        Row: {
          avg_rating: number | null
          current_stock: number | null
          name: string | null
          product_id: string | null
          rating_count: number | null
          revenue: number | null
          slug: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          units_sold: number | null
        }
        Relationships: []
      }
      mv_trending_products: {
        Row: {
          name: string | null
          product_id: string | null
          recent_purchases: number | null
          recent_views: number | null
          slug: string | null
          trending_score: number | null
        }
        Relationships: []
      }
      mv_vendor_daily_sales: {
        Row: {
          order_count: number | null
          revenue: number | null
          sale_date: string | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      mv_vendor_inventory_status: {
        Row: {
          available_stock: number | null
          is_low_stock: boolean | null
          low_stock_threshold: number | null
          product_id: string | null
          product_name: string | null
          reserved_quantity: number | null
          sku: string | null
          stock_quantity: number | null
          store_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      mv_vendor_monthly_sales: {
        Row: {
          order_count: number | null
          revenue: number | null
          sale_month: string | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      mv_vendor_print_stats: {
        Row: {
          assigned_count: number | null
          avg_completion_seconds: number | null
          completed_count: number | null
          failed_count: number | null
          printing_count: number | null
          quality_check_count: number | null
          queued_count: number | null
          reprint_status_count: number | null
          store_id: string | null
          total_jobs: number | null
          total_reprint_attempts: number | null
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      mv_vendor_top_products: {
        Row: {
          product_id: string | null
          product_name: string | null
          revenue: number | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      notification_summary: {
        Row: {
          latest_at: string | null
          total_count: number | null
          unread_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_print_files: {
        Row: {
          area_dpi: number | null
          bleed_mm: number | null
          design_file_path: string | null
          dpi: number | null
          file_format: Database["public"]["Enums"]["design_file_format"] | null
          font_size: number | null
          height_px: number | null
          layer_id: string | null
          layer_type: string | null
          order_id: string | null
          order_item_id: string | null
          position_x: number | null
          position_y: number | null
          print_area_name: string | null
          printing_area_height: number | null
          printing_area_width: number | null
          printing_instructions: string | null
          product_name_snapshot: string | null
          quantity: number | null
          rotation_deg: number | null
          scale: number | null
          sku_snapshot: string | null
          text_color: string | null
          text_content: string | null
          width_px: number | null
          z_index: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items_detailed: {
        Row: {
          created_at: string | null
          current_sku: string | null
          customization_id: string | null
          customization_preview_url: string | null
          gift_note: string | null
          id: string | null
          is_gift_wrapped: boolean | null
          line_total: number | null
          options_snapshot: Json | null
          order_id: string | null
          order_number: string | null
          order_owner_id: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          printing_instructions: string | null
          product_name_snapshot: string | null
          product_slug: string | null
          quantity: number | null
          sku_snapshot: string | null
          status: Database["public"]["Enums"]["order_item_status"] | null
          unit_price_snapshot: number | null
          updated_at: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: false
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["order_owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["order_owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["order_owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["order_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_summary: {
        Row: {
          currency: string | null
          first_item_name: string | null
          gift_wrap: boolean | null
          id: string | null
          item_count: number | null
          order_number: string | null
          placed_at: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total: number | null
          total_quantity: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews_detailed: {
        Row: {
          body: string | null
          created_at: string | null
          deleted_at: string | null
          helpful_count: number | null
          id: string | null
          is_verified_purchase: boolean | null
          media_count: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          not_helpful_count: number | null
          order_item_id: string | null
          product_id: string | null
          rating: number | null
          reply_count: number | null
          report_count: number | null
          reviewer_avatar_url: string | null
          reviewer_name: string | null
          status: Database["public"]["Enums"]["review_status"] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "admin_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_trending_products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_conversion_metrics"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "vendor_pending_designs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items_detailed"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_tracking: {
        Row: {
          actual_delivery_date: string | null
          carrier: string | null
          delivered_at: string | null
          estimated_delivery_date_max: string | null
          estimated_delivery_date_min: string | null
          item_count: number | null
          method_name: string | null
          method_type: string | null
          order_id: string | null
          pickup_address_line1: string | null
          pickup_city: string | null
          pickup_location_name: string | null
          shipment_id: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          tracking_number: string | null
          tracking_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_products: {
        Row: {
          avg_rating: number | null
          brand_name: string | null
          brand_slug: string | null
          category_name: string | null
          category_slug: string | null
          currency: string | null
          id: string | null
          in_stock: boolean | null
          is_featured: boolean | null
          max_price: number | null
          min_price: number | null
          name: string | null
          primary_image: string | null
          rating_count: number | null
          short_description: string | null
          slug: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          visibility: Database["public"]["Enums"]["product_visibility"] | null
        }
        Relationships: []
      }
      vendor_average_order_value: {
        Row: {
          avg_order_value: number | null
          orders_count: number | null
          store_id: string | null
          total_revenue: number | null
        }
        Relationships: []
      }
      vendor_best_customers: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          orders_count: number | null
          store_id: string | null
          total_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_conversion_metrics: {
        Row: {
          conversion_rate_pct: number | null
          orders_count: number | null
          product_id: string | null
          product_name: string | null
          store_id: string | null
          units_sold: number | null
          view_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_customer_retention: {
        Row: {
          retention_rate_pct: number | null
          returning_customers: number | null
          store_id: string | null
          total_customers: number | null
        }
        Relationships: []
      }
      vendor_dashboard_overview: {
        Row: {
          low_stock_count: number | null
          pending_designs: number | null
          pending_print_jobs: number | null
          pending_shipments: number | null
          store_id: string | null
          store_name: string | null
          store_status: string | null
          total_orders: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      vendor_monthly_stats: {
        Row: {
          month: string | null
          orders_count: number | null
          revenue: number | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      vendor_mv_daily_sales: {
        Row: {
          order_count: number | null
          revenue: number | null
          sale_date: string | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      vendor_mv_inventory_status: {
        Row: {
          available_stock: number | null
          is_low_stock: boolean | null
          low_stock_threshold: number | null
          product_id: string | null
          product_name: string | null
          reserved_quantity: number | null
          sku: string | null
          stock_quantity: number | null
          store_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_mv_monthly_sales: {
        Row: {
          order_count: number | null
          revenue: number | null
          sale_month: string | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      vendor_mv_print_stats: {
        Row: {
          assigned_count: number | null
          avg_completion_seconds: number | null
          completed_count: number | null
          failed_count: number | null
          printing_count: number | null
          quality_check_count: number | null
          queued_count: number | null
          reprint_status_count: number | null
          store_id: string | null
          total_jobs: number | null
          total_reprint_attempts: number | null
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_mv_top_products: {
        Row: {
          product_id: string | null
          product_name: string | null
          revenue: number | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      vendor_order_items: {
        Row: {
          created_at: string | null
          customer_id: string | null
          customization_id: string | null
          item_status: Database["public"]["Enums"]["order_item_status"] | null
          line_total: number | null
          order_deleted_at: string | null
          order_id: string | null
          order_item_id: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          placed_at: string | null
          product_id: string | null
          product_name_snapshot: string | null
          quantity: number | null
          sku_snapshot: string | null
          store_id: string | null
          unit_price_snapshot: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: false
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_pending_designs: {
        Row: {
          created_at: string | null
          design_id: string | null
          owner_id: string | null
          product_id: string | null
          product_name: string | null
          status: Database["public"]["Enums"]["design_status"] | null
          store_id: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_designs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_pending_shipments: {
        Row: {
          carrier: string | null
          created_at: string | null
          estimated_delivery_date_max: string | null
          estimated_delivery_date_min: string | null
          order_id: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          store_id: string | null
          tracking_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_printing_queue: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          notes: string | null
          order_item_id: string | null
          order_number: string | null
          placed_at: string | null
          print_job_id: string | null
          printing_instructions: string | null
          product_name_snapshot: string | null
          quantity: number | null
          reprint_count: number | null
          sku_snapshot: string | null
          started_at: string | null
          status: string | null
          store_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_customers_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "mv_customer_ltv"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "print_jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "admin_printing_queue"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_item_print_files"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "vendor_order_items"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "vendor_dashboard_overview"
            referencedColumns: ["store_id"]
          },
        ]
      }
      vendor_refund_rate: {
        Row: {
          refund_rate_pct: number | null
          refunded_items: number | null
          store_id: string | null
          total_items: number | null
        }
        Relationships: []
      }
      vendor_revenue_over_time: {
        Row: {
          orders_count: number | null
          revenue: number | null
          sale_date: string | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      vendor_sales_by_category: {
        Row: {
          category_id: string | null
          category_name: string | null
          revenue: number | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      vendor_top_products: {
        Row: {
          product_id: string | null
          product_name: string | null
          revenue: number | null
          store_id: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      wishlist_items_detailed: {
        Row: {
          added_at: string | null
          customization_id: string | null
          customization_name: string | null
          customization_preview_url: string | null
          id: string | null
          in_stock: boolean | null
          note: string | null
          price: number | null
          product_id: string | null
          product_name: string | null
          product_slug: string | null
          sku: string | null
          sort_order: number | null
          variant_id: string | null
          wishlist_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_customization_id_fkey"
            columns: ["customization_id"]
            isOneToOne: true
            referencedRelation: "product_customizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "admin_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "low_stock_variants"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mv_vendor_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vendor_mv_inventory_status"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "wishlist_items_wishlist_id_fkey"
            columns: ["wishlist_id"]
            isOneToOne: false
            referencedRelation: "wishlists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_to_cart: {
        Args: {
          p_customization_id?: string
          p_quantity: number
          p_session_token?: string
          p_variant_id: string
        }
        Returns: {
          added_at: string
          cart_id: string
          color: string | null
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          is_saved_for_later: boolean
          quantity: number
          reserved_until: string | null
          size: string | null
          unit_price_snapshot: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_coupon: {
        Args: { p_cart_id: string; p_code: string; p_session_token?: string }
        Returns: {
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          discount_amount: number
          expires_at: string | null
          id: string
          last_activity_at: string
          merged_into_cart_id: string | null
          owner_id: string | null
          session_token: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "carts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_vendor_payout_request: {
        Args: { p_notes?: string; p_request_id: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          payout_method: string | null
          payout_request_id: string | null
          processed_at: string | null
          processed_by: string | null
          provider_reference: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vendor_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_product: {
        Args: { p_product_id: string }
        Returns: {
          available_colors: string[]
          avg_rating: number
          base_price: number
          brand_id: string | null
          category_id: string | null
          color: string | null
          compare_at_price: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          height_cm: number | null
          id: string
          is_featured: boolean
          length_cm: number | null
          low_stock_threshold: number
          name: string
          published_at: string | null
          rating_count: number
          search_vector: unknown
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          short_description: string | null
          slug: string
          specifications: Json
          status: Database["public"]["Enums"]["product_status"]
          store_id: string | null
          updated_at: string
          view_count: number
          visibility: Database["public"]["Enums"]["product_visibility"]
          weight_grams: number | null
          width_cm: number | null
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_print_job: {
        Args: { p_print_job_id: string }
        Returns: {
          assigned_to: string | null
          attempt_number: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          notes: string | null
          order_item_id: string
          printer_id: string | null
          reprint_count: number
          started_at: string | null
          status: string
          store_id: string | null
          timeout_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bulk_update_inventory: {
        Args: { p_updates: Json }
        Returns: {
          barcode: string | null
          compare_at_price: number | null
          created_at: string
          deleted_at: string | null
          height_cm: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_default: boolean
          length_cm: number | null
          low_stock_threshold: number | null
          price: number
          product_id: string
          reserved_quantity: number
          sku: string
          stock_quantity: number
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "product_variants"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bulk_update_products: {
        Args: {
          p_is_featured?: boolean
          p_product_ids: string[]
          p_status?: Database["public"]["Enums"]["product_status"]
          p_visibility?: Database["public"]["Enums"]["product_visibility"]
        }
        Returns: {
          available_colors: string[]
          avg_rating: number
          base_price: number
          brand_id: string | null
          category_id: string | null
          color: string | null
          compare_at_price: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          height_cm: number | null
          id: string
          is_featured: boolean
          length_cm: number | null
          low_stock_threshold: number
          name: string
          published_at: string | null
          rating_count: number
          search_vector: unknown
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          short_description: string | null
          slug: string
          specifications: Json
          status: Database["public"]["Enums"]["product_status"]
          store_id: string | null
          updated_at: string
          view_count: number
          visibility: Database["public"]["Enums"]["product_visibility"]
          weight_grams: number | null
          width_cm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      calculate_print_backoff_seconds: {
        Args: { p_attempt_number: number }
        Returns: number
      }
      calculate_tax: {
        Args: { p_shipping_address: Json; p_subtotal: number }
        Returns: number
      }
      can_access_cart: {
        Args: { p_cart_id: string; p_session_token?: string }
        Returns: boolean
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: {
          billing_address_snapshot: Json | null
          cart_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          customer_note: string | null
          deleted_at: string | null
          discount_amount: number
          gift_note: string | null
          gift_wrap: boolean
          gift_wrap_fee: number
          id: string
          internal_note: string | null
          order_number: string
          placed_at: string
          shipping_address_snapshot: Json
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cart_reservation_window: { Args: never; Returns: string }
      cart_ttl: { Args: { p_is_guest: boolean }; Returns: string }
      checkout: {
        Args: {
          p_billing_address?: Json
          p_cart_id: string
          p_customer_note?: string
          p_gift_note?: string
          p_gift_wrap?: boolean
          p_session_token?: string
          p_shipping_address: Json
          p_shipping_fee?: number
        }
        Returns: {
          billing_address_snapshot: Json | null
          cart_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          customer_note: string | null
          deleted_at: string | null
          discount_amount: number
          gift_note: string | null
          gift_wrap: boolean
          gift_wrap_fee: number
          id: string
          internal_note: string | null
          order_number: string
          placed_at: string
          shipping_address_snapshot: Json
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_notification_deliveries: {
        Args: { p_channel: string; p_limit?: number }
        Returns: {
          channel: string
          claimed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          notification_id: string
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_orphaned_uploads: {
        Args: never
        Returns: {
          storage_path: string
        }[]
      }
      confirm_order_payment: {
        Args: {
          p_amount: number
          p_order_id: string
          p_provider: string
          p_provider_payment_id: string
          p_raw_response?: Json
        }
        Returns: {
          billing_address_snapshot: Json | null
          cart_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          customer_note: string | null
          deleted_at: string | null
          discount_amount: number
          gift_note: string | null
          gift_wrap: boolean
          gift_wrap_fee: number
          id: string
          internal_note: string | null
          order_number: string
          placed_at: string
          shipping_address_snapshot: Json
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_notification: {
        Args: {
          p_body: string
          p_category: string
          p_data?: Json
          p_event_type: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_return_request: {
        Args: { p_items: Json; p_order_id: string; p_reason: string }
        Returns: {
          created_at: string
          id: string
          order_id: string
          reason: string
          requested_by: string
          resolution_note: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_shipment: {
        Args: {
          p_carrier?: string
          p_order_id: string
          p_order_item_ids: string[]
          p_pickup_location_id?: string
          p_shipping_fee_charged?: number
          p_shipping_method_id: string
          p_weight_grams?: number
        }
        Returns: {
          actual_delivery_date: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          estimated_delivery_date_max: string | null
          estimated_delivery_date_min: string | null
          id: string
          notes: string | null
          order_id: string
          pickup_location_id: string | null
          recipient_signature: string | null
          shipped_at: string | null
          shipping_fee_charged: number
          shipping_method_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          weight_grams: number | null
        }
        SetofOptions: {
          from: "*"
          to: "shipments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      deactivate_expired_coupons: { Args: never; Returns: number }
      duplicate_product: {
        Args: { p_product_id: string }
        Returns: {
          available_colors: string[]
          avg_rating: number
          base_price: number
          brand_id: string | null
          category_id: string | null
          color: string | null
          compare_at_price: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          height_cm: number | null
          id: string
          is_featured: boolean
          length_cm: number | null
          low_stock_threshold: number
          name: string
          published_at: string | null
          rating_count: number
          search_vector: unknown
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          short_description: string | null
          slug: string
          specifications: Json
          status: Database["public"]["Enums"]["product_status"]
          store_id: string | null
          updated_at: string
          view_count: number
          visibility: Database["public"]["Enums"]["product_visibility"]
          weight_grams: number | null
          width_cm: number | null
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_stale_carts: { Args: never; Returns: number }
      get_or_create_cart: {
        Args: { p_session_token?: string }
        Returns: string
      }
      get_order_internal_note: { Args: { p_order_id: string }; Returns: string }
      get_popular_searches: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          query: string
          search_count: number
        }[]
      }
      get_recently_viewed: {
        Args: { p_limit?: number; p_session_token?: string }
        Returns: {
          last_viewed_at: string
          min_price: number
          name: string
          primary_image: string
          product_id: string
          slug: string
        }[]
      }
      get_recommended_products: {
        Args: { p_limit?: number; p_product_id: string }
        Returns: {
          avg_rating: number
          min_price: number
          name: string
          primary_image: string
          product_id: string
          reason: string
          slug: string
        }[]
      }
      get_search_facets: {
        Args: { p_category_id?: string; p_query?: string }
        Returns: Json
      }
      get_search_suggestions: {
        Args: { p_limit?: number; p_prefix: string }
        Returns: {
          ref_id: string
          suggestion: string
          type: string
        }[]
      }
      get_shared_wishlist: { Args: { p_share_token: string }; Returns: Json }
      get_shipping_options: {
        Args: {
          p_country: string
          p_order_subtotal?: number
          p_weight_grams?: number
        }
        Returns: {
          carrier: string
          fee: number
          is_free: boolean
          max_delivery_days: number
          method_id: string
          method_name: string
          method_type: string
          min_delivery_days: number
        }[]
      }
      gift_wrap_fee: { Args: never; Returns: number }
      handle_print_job_timeouts: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_printer_online: { Args: { p_printer_id: string }; Returns: boolean }
      is_vendor: { Args: never; Returns: boolean }
      issue_refund: {
        Args: {
          p_amount: number
          p_order_id: string
          p_payment_id?: string
          p_reason: string
          p_return_id?: string
        }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          payment_id: string | null
          processed_by: string | null
          provider_refund_id: string | null
          reason: string
          return_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_search: {
        Args: {
          p_clicked_product_id?: string
          p_query: string
          p_result_count?: number
          p_session_token?: string
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_cod_collected: {
        Args: { p_payment_id: string }
        Returns: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: {
          body: string | null
          category: string
          created_at: string
          data: Json
          event_type: string
          id: string
          is_read: boolean
          read_at: string | null
          title: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_refund_completed: {
        Args: { p_payment_reference?: string; p_refund_id: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          payment_id: string | null
          processed_by: string | null
          provider_refund_id: string | null
          reason: string
          return_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_refund_failed: {
        Args: { p_reason?: string; p_refund_id: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          payment_id: string | null
          processed_by: string | null
          provider_refund_id: string | null
          reason: string
          return_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_stale_printers_offline: { Args: never; Returns: number }
      mark_vendor_payout_paid: {
        Args: {
          p_notes?: string
          p_payout_id: string
          p_provider_reference?: string
        }
        Returns: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          payout_method: string | null
          payout_request_id: string | null
          processed_at: string | null
          processed_by: string | null
          provider_reference: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vendor_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merge_guest_cart: { Args: { p_session_token: string }; Returns: string }
      moderate_review: {
        Args: {
          p_new_status: Database["public"]["Enums"]["review_status"]
          p_note?: string
          p_review_id: string
        }
        Returns: {
          body: string | null
          created_at: string
          deleted_at: string | null
          helpful_count: number
          id: string
          is_verified_purchase: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          not_helpful_count: number
          order_item_id: string | null
          product_id: string
          rating: number
          report_count: number
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_to_cart: {
        Args: { p_cart_item_id: string; p_session_token?: string }
        Returns: {
          added_at: string
          cart_id: string
          color: string | null
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          is_saved_for_later: boolean
          quantity: number
          reserved_until: string | null
          size: string | null
          unit_price_snapshot: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_wishlist_item_to_cart: {
        Args: {
          p_quantity?: number
          p_session_token?: string
          p_wishlist_item_id: string
        }
        Returns: {
          added_at: string
          cart_id: string
          color: string | null
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          is_saved_for_later: boolean
          quantity: number
          reserved_until: string | null
          size: string | null
          unit_price_snapshot: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      owns_customization: { Args: { target_id: string }; Returns: boolean }
      owns_design: { Args: { target_design_id: string }; Returns: boolean }
      owns_notification: { Args: { target_id: string }; Returns: boolean }
      owns_order: { Args: { target_order_id: string }; Returns: boolean }
      owns_payment: { Args: { target_payment_id: string }; Returns: boolean }
      owns_product: { Args: { target_product_id: string }; Returns: boolean }
      owns_review: { Args: { target_review_id: string }; Returns: boolean }
      owns_shipment: { Args: { target_shipment_id: string }; Returns: boolean }
      owns_store: { Args: { target_store_id: string }; Returns: boolean }
      owns_wallet: { Args: { target_wallet_id: string }; Returns: boolean }
      owns_wishlist: { Args: { target_id: string }; Returns: boolean }
      pay_with_cod: {
        Args: { p_order_id: string }
        Returns: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_with_wallet: {
        Args: { p_amount?: number; p_order_id: string }
        Returns: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      printer_heartbeat: { Args: { p_printer_id: string }; Returns: undefined }
      process_payment_failure: {
        Args: {
          p_failure_code?: string
          p_failure_message?: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_provider_payment_id: string
          p_raw_response?: Json
        }
        Returns: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_payment_success: {
        Args: {
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_provider_payment_id: string
          p_raw_response?: Json
        }
        Returns: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_print_job_retries: { Args: never; Returns: number }
      promote_exhausted_print_jobs_to_dead_letter: {
        Args: never
        Returns: number
      }
      reconcile_payments: {
        Args: never
        Returns: {
          action: string
          new_payment_status: string
          old_payment_status: string
          order_id: string
        }[]
      }
      record_payment_event: {
        Args: {
          p_event_type: string
          p_payload: Json
          p_payment_id?: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_provider_event_id: string
          p_signature_verified: boolean
        }
        Returns: {
          event_id: string
          is_new: boolean
        }[]
      }
      refresh_admin_dashboard_views: { Args: never; Returns: undefined }
      refresh_trending_products: { Args: never; Returns: undefined }
      refresh_vendor_dashboard_views: { Args: never; Returns: undefined }
      regenerate_share_token: {
        Args: { p_wishlist_id: string }
        Returns: string
      }
      register_push_device: {
        Args: {
          p_device_name?: string
          p_platform: string
          p_push_token: string
        }
        Returns: {
          created_at: string
          device_name: string | null
          id: string
          is_active: boolean
          last_used_at: string
          platform: string
          push_token: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "push_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_vendor_payout: {
        Args: { p_payout_id: string; p_reason: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          payout_method: string | null
          payout_request_id: string | null
          processed_at: string | null
          processed_by: string | null
          provider_reference: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vendor_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_vendor_payout_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          rejection_reason: string | null
          requested_amount: number
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vendor_payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_expired_reservations: { Args: never; Returns: number }
      remove_cart_item: {
        Args: { p_cart_item_id: string; p_session_token?: string }
        Returns: boolean
      }
      remove_coupon: {
        Args: { p_cart_id: string; p_session_token?: string }
        Returns: {
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          discount_amount: number
          expires_at: string | null
          id: string
          last_activity_at: string
          merged_into_cart_id: string | null
          owner_id: string | null
          session_token: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "carts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reply_to_review: {
        Args: {
          p_body: string
          p_parent_reply_id?: string
          p_review_id: string
        }
        Returns: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          is_seller_reply: boolean
          parent_reply_id: string | null
          review_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "review_replies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_review: {
        Args: { p_details?: string; p_reason: string; p_review_id: string }
        Returns: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_by: string
          review_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "review_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_payment_refund: {
        Args: {
          p_amount: number
          p_payment_id: string
          p_reason?: string
          p_return_id?: string
        }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          payment_id: string | null
          processed_by: string | null
          provider_refund_id: string | null
          reason: string
          return_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_sms_verification: {
        Args: { p_phone_number: string }
        Returns: string
      }
      request_vendor_payout: {
        Args: { p_amount: number; p_store_id: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          rejection_reason: string | null
          requested_amount: number
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vendor_payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_vendor_commission_rate: {
        Args: { p_store_id: string }
        Returns: number
      }
      retry_failed_payment: {
        Args: { p_payment_id: string }
        Returns: {
          amount: number
          attempt_number: number
          authorized_at: string | null
          captured_at: string | null
          client_secret: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_payment_id: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_print_queue_maintenance: { Args: never; Returns: Json }
      save_for_later: {
        Args: { p_cart_item_id: string; p_session_token?: string }
        Returns: {
          added_at: string
          cart_id: string
          color: string | null
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          is_saved_for_later: boolean
          quantity: number
          reserved_until: string | null
          size: string | null
          unit_price_snapshot: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_products: {
        Args: {
          p_brand_id?: string
          p_category_id?: string
          p_in_stock_only?: boolean
          p_max_price?: number
          p_min_price?: number
          p_min_rating?: number
          p_page?: number
          p_page_size?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          avg_rating: number
          brand_name: string
          category_name: string
          in_stock: boolean
          is_featured: boolean
          max_price: number
          min_price: number
          name: string
          primary_image: string
          product_id: string
          rating_count: number
          relevance: number
          short_description: string
          slug: string
          total_count: number
        }[]
      }
      slugify: { Args: { input: string }; Returns: string }
      sync_product_available_colors: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      track_product_view: {
        Args: { p_product_id: string; p_session_token?: string }
        Returns: undefined
      }
      unregister_push_device: {
        Args: { p_push_token: string }
        Returns: boolean
      }
      update_cart_item_quantity: {
        Args: {
          p_cart_item_id: string
          p_quantity: number
          p_session_token?: string
        }
        Returns: {
          added_at: string
          cart_id: string
          color: string | null
          customization_id: string | null
          gift_note: string | null
          id: string
          is_gift_wrapped: boolean
          is_saved_for_later: boolean
          quantity: number
          reserved_until: string | null
          size: string | null
          unit_price_snapshot: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_notification_preferences: {
        Args: {
          p_category: string
          p_email_enabled?: boolean
          p_in_app_enabled?: boolean
          p_push_enabled?: boolean
          p_sms_enabled?: boolean
        }
        Returns: {
          category: string
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_order_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_note?: string
          p_order_id: string
        }
        Returns: {
          billing_address_snapshot: Json | null
          cart_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency: string
          customer_note: string | null
          deleted_at: string | null
          discount_amount: number
          gift_note: string | null
          gift_wrap: boolean
          gift_wrap_fee: number
          id: string
          internal_note: string | null
          order_number: string
          placed_at: string
          shipping_address_snapshot: Json
          shipping_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_return_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["return_status"]
          p_resolution_note?: string
          p_return_id: string
        }
        Returns: {
          created_at: string
          id: string
          order_id: string
          reason: string
          requested_by: string
          resolution_note: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_shipment_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["shipment_status"]
          p_note?: string
          p_shipment_id: string
          p_tracking_number?: string
          p_tracking_url?: string
        }
        Returns: {
          actual_delivery_date: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          estimated_delivery_date_max: string | null
          estimated_delivery_date_min: string | null
          id: string
          notes: string | null
          order_id: string
          pickup_location_id: string | null
          recipient_signature: string | null
          shipped_at: string | null
          shipping_fee_charged: number
          shipping_method_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          weight_grams: number | null
        }
        SetofOptions: {
          from: "*"
          to: "shipments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_sms_code: { Args: { p_code: string }; Returns: boolean }
      verify_sms_number: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          id: string
          is_verified: boolean
          phone_number: string
          updated_at: string
          user_id: string
          verification_code: string | null
          verification_expires_at: string | null
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sms_numbers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vote_review: {
        Args: { p_review_id: string; p_vote_type: string }
        Returns: {
          created_at: string
          id: string
          review_id: string
          user_id: string
          vote_type: string
        }
        SetofOptions: {
          from: "*"
          to: "review_votes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "customer" | "vendor" | "admin"
      design_file_format: "png" | "svg" | "pdf" | "ai" | "psd"
      design_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "archived"
      order_item_status:
        | "pending"
        | "processing"
        | "printed"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "returned"
        | "refunded"
      order_status:
        | "pending"
        | "paid"
        | "processing"
        | "printing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
      payment_provider: "stripe" | "paymob" | "cod" | "wallet"
      payment_transaction_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
      product_status: "draft" | "published" | "archived"
      product_visibility: "visible" | "hidden"
      refund_status: "pending" | "processing" | "completed" | "failed"
      return_status:
        | "requested"
        | "approved"
        | "rejected"
        | "item_received"
        | "completed"
      review_status: "pending" | "approved" | "rejected" | "hidden"
      shipment_status:
        | "pending"
        | "label_created"
        | "picked_up"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
        | "failed_delivery"
        | "returned"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "vendor", "admin"],
      design_file_format: ["png", "svg", "pdf", "ai", "psd"],
      design_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "archived",
      ],
      order_item_status: [
        "pending",
        "processing",
        "printed",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
        "refunded",
      ],
      order_status: [
        "pending",
        "paid",
        "processing",
        "printing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      payment_provider: ["stripe", "paymob", "cod", "wallet"],
      payment_transaction_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
      ],
      product_status: ["draft", "published", "archived"],
      product_visibility: ["visible", "hidden"],
      refund_status: ["pending", "processing", "completed", "failed"],
      return_status: [
        "requested",
        "approved",
        "rejected",
        "item_received",
        "completed",
      ],
      review_status: ["pending", "approved", "rejected", "hidden"],
      shipment_status: [
        "pending",
        "label_created",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "failed_delivery",
        "returned",
        "cancelled",
      ],
    },
  },
} as const

