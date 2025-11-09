/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#00A37A",
          50: "#E1FFF4",
          100: "#B3FFE0",
          200: "#80F7CD",
          300: "#4DEEB9",
          400: "#26DDA3",
          500: "#00C68A",
          600: "#00A37A",
          700: "#00775A",
          800: "#005845",
          900: "#003C30"
        },
        slate: {
          950: "#0F172A"
        }
      }
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography")
  ],
}
