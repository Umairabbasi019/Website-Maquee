import { Cormorant_Garamond, Inter } from "next/font/google";

// next/font needs literal options; the `variable` names must match LOADED_FONTS in theme.ts.
const cormorant = Cormorant_Garamond({
  weight: ["300", "400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--f-cormorant",
});
const inter = Inter({ weight: ["400", "500", "600"], subsets: ["latin"], display: "swap", variable: "--f-inter" });

export const fontClassName = `${cormorant.variable} ${inter.variable}`;
