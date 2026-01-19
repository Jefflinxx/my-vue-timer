import AppFrame from "./components/AppFrame";
import StyledComponentsRegistry from "./components/StyledComponentsRegistry";
import GlobalStyles from "./components/GlobalStyles";
import { Nunito } from "next/font/google";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["300", "600", "800"],
  display: "swap",
});

export const metadata = {
  title: "My Timer Hub",
  description: "集中入口整合計時器與工具的 Next.js 版本",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="zh-Hant"
      className={nunito.className}
      style={{ backgroundColor: "#1b1917" }}
    >
      <body style={{ margin: 0, backgroundColor: "#1b1917" }}>
        <StyledComponentsRegistry>
          <GlobalStyles />
          <AppFrame>{children}</AppFrame>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
