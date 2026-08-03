/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  darkMode: "class",
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        anthra: {
          red: "#C8102E",
          "red-pressed": "#A90D27",
          "red-vivid": "#FF3B4D"
        },
        light: {
          canvas: "#FCFAFA",
          surface: "#FFFFFF",
          elevated: "#FFFFFF",
          subtle: "#F7F2F3",
          pressed: "#F3E9EB",
          text: "#1A1718",
          muted: "#6B5F61",
          tertiary: "#786B6E",
          border: "#E9DEE0",
          "border-strong": "#D6C6C9",
          brand: "#C8102E",
          "brand-soft": "#FFF0F2"
        },
        dark: {
          canvas: "#070707",
          surface: "#111111",
          elevated: "#191617",
          subtle: "#151213",
          pressed: "#211A1C",
          text: "#F8F5F5",
          muted: "#B8AFB0",
          tertiary: "#918789",
          border: "#322A2C",
          "border-strong": "#4A3D40",
          brand: "#FF3B4D",
          "brand-soft": "#2A0E13"
        },
        status: {
          success: "#157347",
          warning: "#8A5700",
          danger: "#B42318",
          info: "#155E75"
        }
      },
      borderRadius: {
        "anthra-sm": "8px",
        "anthra-md": "12px",
        "anthra-lg": "16px",
        "anthra-xl": "20px",
        "anthra-2xl": "24px"
      },
      spacing: {
        touch: "48px",
        "touch-compact": "44px",
        "screen-gutter": "20px"
      }
    }
  },
  plugins: []
};
