/**
 * The welcome modal's picture: two screenshots on a stepped pink background,
 * one in a browser frame and one in a phone, with the editor's tools on them
 * (numbered steps, a box, an arrow, a blur, a magnifier and crop marks).
 * Drawn here so it stays sharp at any size. app/opengraph-image.png is the
 * same picture, for link previews.
 */
export function TourIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1040 680"
      className={className}
      role="img"
      aria-label="Two screenshots, framed, annotated, blurred, magnified and cropped on a stepped pink background"
    >
      <defs>
        <clipPath id="tour-canvas">
          <rect width="1040" height="680" rx="6" />
        </clipPath>
        <clipPath id="tour-browser">
          <rect x="56" y="64" width="620" height="440" rx="6" />
        </clipPath>
        <clipPath id="tour-field">
          <rect x="85" y="325" width="298" height="38" rx="4" />
        </clipPath>
        <clipPath id="tour-loupe">
          <circle cx="524" cy="560" r="80" />
        </clipPath>
        <filter id="tour-blurArea" x="-10%" y="-20%" width="120%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <g
        clipPath="url(#tour-canvas)"
        fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
      >
        {/* Stepped background. */}
        <rect x="0" y="0" width="208" height="680" fill="#6a2150" />
        <rect x="208" y="0" width="208" height="680" fill="#d10373" />
        <rect x="416" y="0" width="208" height="680" fill="#e368ab" />
        <rect x="624" y="0" width="208" height="680" fill="#f6cde3" />
        <rect x="832" y="0" width="208" height="680" fill="#fae5f1" />

        {/* Browser: shadow. */}
        <rect x="72" y="80" width="620" height="440" rx="6" fill="#424a52" />
        {/* Browser frame and page. */}
        <g clipPath="url(#tour-browser)">
          <rect x="56" y="64" width="620" height="440" fill="#ffffff" />
          <rect x="56" y="64" width="620" height="40" fill="#eceded" />
          <line
            x1="56"
            y1="103.5"
            x2="676"
            y2="103.5"
            stroke="#d9dbdc"
            strokeWidth="1"
          />
          <circle cx="77" cy="84" r="5" fill="#8e9297" />
          <circle cx="93" cy="84" r="5" fill="#8e9297" />
          <circle cx="109" cy="84" r="5" fill="#8e9297" />
          <rect x="146" y="73" width="320" height="22" rx="4" fill="#ffffff" />
          <rect x="158" y="81" width="140" height="6" rx="2" fill="#d9dbdc" />

          <rect x="84" y="128" width="24" height="24" rx="4" fill="#424a52" />
          <rect x="124" y="137" width="56" height="7" rx="2" fill="#d9dbdc" />
          <rect x="192" y="137" width="56" height="7" rx="2" fill="#d9dbdc" />
          <rect x="260" y="137" width="56" height="7" rx="2" fill="#d9dbdc" />

          <rect x="84" y="180" width="340" height="20" rx="2" fill="#424a52" />
          <rect x="84" y="210" width="240" height="20" rx="2" fill="#424a52" />
          <rect x="84" y="250" width="420" height="10" rx="2" fill="#d9dbdc" />
          <rect x="84" y="268" width="380" height="10" rx="2" fill="#d9dbdc" />

          <g filter="url(#tour-blurArea)">
            <text x="84" y="314" fontSize="13" fontWeight="600" fill="#424a52">
              Email address
            </text>
            <rect
              x="84.5"
              y="324.5"
              width="299"
              height="39"
              rx="4"
              fill="#ffffff"
              stroke="#8e9297"
            />
            <g clipPath="url(#tour-field)">
              <text x="96" y="349" fontSize="15" fill="#000000">
                jordan.lee@example.com
              </text>
            </g>
            <text x="84" y="390" fontSize="13" fontWeight="600" fill="#424a52">
              Display name
            </text>
            <rect
              x="84.5"
              y="400.5"
              width="299"
              height="39"
              rx="4"
              fill="#ffffff"
              stroke="#8e9297"
            />
            <text x="96" y="425" fontSize="15" fill="#000000">
              Jordan
            </text>
          </g>

          <rect x="436" y="400" width="150" height="40" rx="4" fill="#f9c909" />
          <text
            x="511"
            y="425"
            fontSize="15"
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
          >
            Save changes
          </text>
          <rect
            x="425.5"
            y="389.5"
            width="171"
            height="61"
            rx="4.5"
            fill="none"
            stroke="#d10373"
            strokeWidth="3"
          />

          <g
            transform="translate(56 64)"
            fill="none"
            stroke="#000000"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M 588 142 Q 604 250 552 318" />
            <path d="M 554 299 L 552 318 L 569 311" />
          </g>
        </g>
        <rect
          x="56.5"
          y="64.5"
          width="619"
          height="439"
          rx="5.5"
          fill="none"
          stroke="#d9dbdc"
        />

        {/* Magnifier. */}
        <line
          x1="511"
          y1="442"
          x2="524"
          y2="478"
          stroke="#424a52"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="524" cy="560" r="84" fill="#ffffff" />
        <g clipPath="url(#tour-loupe)">
          <rect x="412" y="527" width="224" height="66" rx="6" fill="#f9c909" />
          <text
            x="524"
            y="570"
            fontSize="28"
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
          >
            Save changes
          </text>
        </g>
        <circle
          cx="524"
          cy="560"
          r="81.5"
          fill="none"
          stroke="#424a52"
          strokeWidth="5"
        />

        {/* Phone: shadow, frame, screen. */}
        <rect x="782" y="108" width="210" height="450" rx="34" fill="#424a52" />
        <rect x="770" y="96" width="210" height="450" rx="34" fill="#000000" />
        <rect x="780" y="106" width="190" height="430" rx="26" fill="#ffffff" />
        <rect x="845" y="120" width="60" height="8" rx="4" fill="#d9dbdc" />
        <rect x="796" y="148" width="120" height="16" rx="2" fill="#424a52" />
        <rect x="796" y="176" width="90" height="8" rx="2" fill="#d9dbdc" />
        <g fill="#d9dbdc">
          <circle cx="810" cy="216" r="14" />
          <circle cx="810" cy="258" r="14" />
          <circle cx="810" cy="300" r="14" />
          <circle cx="810" cy="342" r="14" />
          <circle cx="810" cy="384" r="14" />
          <rect x="834" y="220" width="64" height="6" rx="2" />
          <rect x="834" y="262" width="70" height="6" rx="2" />
          <rect x="834" y="304" width="58" height="6" rx="2" />
          <rect x="834" y="346" width="66" height="6" rx="2" />
          <rect x="834" y="388" width="52" height="6" rx="2" />
        </g>
        <g fill="#8e9297">
          <rect x="834" y="206" width="96" height="8" rx="2" />
          <rect x="834" y="248" width="84" height="8" rx="2" />
          <rect x="834" y="290" width="104" height="8" rx="2" />
          <rect x="834" y="332" width="76" height="8" rx="2" />
          <rect x="834" y="374" width="92" height="8" rx="2" />
        </g>
        <rect x="796" y="484" width="158" height="36" rx="4" fill="#f9c909" />
        <text
          x="875"
          y="507"
          fontSize="13"
          fontWeight="600"
          fill="#000000"
          textAnchor="middle"
        >
          Continue
        </text>

        {/* Crop marks. */}
        <g fill="none" stroke="#000000" strokeWidth="4" strokeLinecap="square">
          <path d="M756 108 V82 H782" />
          <path d="M968 82 H994 V108" />
          <path d="M756 534 V560 H782" />
          <path d="M968 560 H994 V534" />
        </g>

        {/* Numbered markers. */}
        <g fontSize="17" fontWeight="700" textAnchor="middle">
          <g>
            <circle
              cx="414"
              cy="344"
              r="17"
              fill="#f9c909"
              stroke="#000000"
              strokeWidth="2"
            />
            <text x="414" y="350" fill="#000000">
              2
            </text>
          </g>
          <g>
            <circle
              cx="614"
              cy="504"
              r="17"
              fill="#f9c909"
              stroke="#000000"
              strokeWidth="2"
            />
            <text x="614" y="510" fill="#000000">
              3
            </text>
          </g>
          <g>
            <circle
              cx="754"
              cy="562"
              r="17"
              fill="#f9c909"
              stroke="#000000"
              strokeWidth="2"
            />
            <text x="754" y="568" fill="#000000">
              4
            </text>
          </g>
          <g>
            <circle
              cx="56"
              cy="64"
              r="17"
              fill="#f9c909"
              stroke="#000000"
              strokeWidth="2"
            />
            <text x="56" y="70" fill="#000000">
              1
            </text>
          </g>
        </g>
      </g>
    </svg>
  );
}
