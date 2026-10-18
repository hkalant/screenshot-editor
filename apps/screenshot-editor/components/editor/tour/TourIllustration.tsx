/**
 * The welcome modal's picture: a screenshot in a browser frame on a brand
 * gradient, with the editor's annotations on it (a numbered step, a box, an
 * arrow and a magnifier). Drawn here so it stays sharp at any size.
 */
export function TourIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 280"
      className={className}
      role="img"
      aria-label="A screenshot in a browser frame on a gradient, with an arrow, a box, a numbered step and a magnifier on it"
    >
      <defs>
        <linearGradient id="tour-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d10373" />
          <stop offset="0.55" stopColor="#e8566a" />
          <stop offset="1" stopColor="#f9c909" />
        </linearGradient>
        <filter id="tour-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow
            dx="0"
            dy="14"
            stdDeviation="14"
            floodColor="#424a52"
            floodOpacity="0.35"
          />
        </filter>
        <clipPath id="tour-window">
          <rect x="110" y="44" width="340" height="236" rx="12" />
        </clipPath>
        <clipPath id="tour-lens">
          <circle cx="430" cy="196" r="44" />
        </clipPath>
      </defs>

      <rect width="560" height="280" fill="url(#tour-bg)" />
      <circle cx="70" cy="40" r="90" fill="#ffffff" opacity="0.08" />
      <circle cx="520" cy="270" r="120" fill="#ffffff" opacity="0.08" />

      {/* The framed screenshot, running off the bottom edge. */}
      <g filter="url(#tour-shadow)">
        <rect x="110" y="44" width="340" height="260" rx="12" fill="#ffffff" />
      </g>
      <g clipPath="url(#tour-window)">
        <rect x="110" y="44" width="340" height="30" fill="#eceded" />
        <circle cx="128" cy="59" r="4.5" fill="#c70540" />
        <circle cx="143" cy="59" r="4.5" fill="#f9c909" />
        <circle cx="158" cy="59" r="4.5" fill="#006338" />
        <rect x="180" y="52" width="200" height="14" rx="7" fill="#ffffff" />

        {/* Page content */}
        <rect x="130" y="92" width="120" height="12" rx="6" fill="#424a52" />
        <rect x="130" y="114" width="190" height="8" rx="4" fill="#d9dbdc" />
        <rect x="130" y="128" width="160" height="8" rx="4" fill="#d9dbdc" />
        <rect x="130" y="152" width="92" height="64" rx="8" fill="#eceded" />
        <rect x="232" y="152" width="92" height="64" rx="8" fill="#eceded" />
        <rect x="334" y="152" width="96" height="64" rx="8" fill="#f2ced9" />
        <rect x="344" y="166" width="54" height="8" rx="4" fill="#c70540" />
        <rect x="344" y="182" width="72" height="6" rx="3" fill="#ffffff" />
        <rect x="130" y="232" width="300" height="8" rx="4" fill="#d9dbdc" />
        <rect x="130" y="246" width="240" height="8" rx="4" fill="#d9dbdc" />

        {/* Annotations: a box round the title and a numbered step. */}
        <rect
          x="122"
          y="84"
          width="136"
          height="28"
          rx="6"
          fill="none"
          stroke="#d10373"
          strokeWidth="3"
        />
      </g>
      <circle cx="262" cy="84" r="13" fill="#d10373" />
      <text
        x="262"
        y="84"
        dy="0.35em"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
      >
        1
      </text>

      {/* A curved arrow from the left margin to the cards. */}
      <path
        d="M52 210 Q 86 150 160 168"
        fill="none"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M150 154 L 176 171 L 148 182 Z" fill="#ffffff" />

      {/* A magnifier showing the pink card up close. */}
      <g clipPath="url(#tour-lens)">
        <rect x="380" y="146" width="100" height="100" fill="#f2ced9" />
        <rect x="388" y="172" width="92" height="14" rx="7" fill="#c70540" />
        <rect x="388" y="200" width="120" height="10" rx="5" fill="#ffffff" />
      </g>
      <circle
        cx="430"
        cy="196"
        r="44"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
      />
      <path
        d="M462 228 L 490 256"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  );
}
