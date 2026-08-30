export function WaveDivider() {
  return (
    <div className="wave-divider" aria-hidden="true">
      <svg
        className="waves-svg"
        preserveAspectRatio="none"
        viewBox="0 24 150 28"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <path
            d="M -160 44 c 30 0 58 -18 88 -18 s 58 18 88 18 s 58 -18 88 -18 s 58 18 88 18 v 44 h -352 Z"
            id="gentle-wave"
          />
        </defs>
        <g className="parallax">
          <use href="#gentle-wave" x="48" y="0" />
          <use href="#gentle-wave" x="48" y="3" />
          <use href="#gentle-wave" x="48" y="5" />
          <use href="#gentle-wave" x="48" y="7" />
        </g>
      </svg>
    </div>
  );
}
