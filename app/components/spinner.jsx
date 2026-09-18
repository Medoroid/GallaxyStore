import React from 'react'

function Spinner() {
  return (
    <div className="spinner-box flex justify-center items-center ">
  <div className="solar-system">
    <div className="earth-orbit orbit">
      <div className="planet earth !bg-blue-600" />
      <div className="venus-orbit orbit">
        <div className="planet venus !bg-emerald-600" />
        <div className="mercury-orbit orbit">
          <div className="planet mercury !bg-red-600" />
          <div className="sun" />
        </div>
      </div>
    </div>
  </div>
</div>
  )
}

export default Spinner