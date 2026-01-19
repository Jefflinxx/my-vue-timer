"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";

const AppFrameContext = createContext({
  openMenu: () => {},
  closeMenu: () => {},
});

export const useAppFrame = () => useContext(AppFrameContext);

// layout 引用了這個元件來包裹整個應用程式的內容
const AppFrame = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarBtnRef = useRef(null);
  const avatarAreaRef = useRef(null);
  const pathname = usePathname();

  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => {
    setMenuOpen(false);
    // Defer blur until after state updates to ensure focus is released.
    requestAnimationFrame(() => {
      avatarBtnRef.current?.blur();
    });
  };

  useEffect(() => {
    setMenuOpen(false);
    avatarBtnRef.current?.blur();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event) => {
      if (!avatarAreaRef.current) return;
      if (!avatarAreaRef.current.contains(event.target)) {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen, closeMenu]);

  const value = {
    openMenu,
    closeMenu,
  };

  const isHome = pathname === "/";

  return (
    <AppFrameContext.Provider value={value}>
      <AppFrameShell>
        <TopNav aria-label="主導覽">
          <TopNavInner>
            <NavLeft>
              {isHome ? (
                <NavTitle>My Apps</NavTitle>
              ) : (
                <BackLink href="/" aria-label="返回入口">
                  ←
                </BackLink>
              )}
            </NavLeft>

            <NavActions>
              <AvatarArea ref={avatarAreaRef}>
                <AvatarButton
                  ref={avatarBtnRef}
                  aria-label="開啟使用者選單"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  onClick={() => (menuOpen ? closeMenu() : openMenu())}
                  $active={menuOpen}
                >
                  <AvatarIcon
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </AvatarIcon>
                </AvatarButton>

                {menuOpen && (
                  <AvatarMenu>
                    <MenuHeader>
                      <UserName>使用者名稱</UserName>
                      <UserEmail>user@example.com</UserEmail>
                    </MenuHeader>

                    <MenuButton onClick={closeMenu}>
                      <MenuIcon
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2.73l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2.73l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </MenuIcon>
                      設定
                    </MenuButton>

                    <MenuButton $danger onClick={closeMenu}>
                      <MenuIcon
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" x2="9" y1="12" y2="12" />
                      </MenuIcon>
                      登出
                    </MenuButton>
                  </AvatarMenu>
                )}
              </AvatarArea>
            </NavActions>
          </TopNavInner>
        </TopNav>

        {menuOpen && <MenuBackdrop onClick={closeMenu} aria-hidden="true"></MenuBackdrop>}
        <AppContent>{children}</AppContent>
      </AppFrameShell>
    </AppFrameContext.Provider>
  );
};

export default AppFrame;

// 最外層
// JJ
const AppFrameShell = styled.div`
  /* min-height: 100vh; */
  width: 100%;
  position: relative;
  background: #1b1917;
  box-sizing: border-box;
  /* padding-top: 74px; */
`;

// 內容區域
// JJ
const AppContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  /* padding: 0 0 80px; */
  min-height: calc(100vh - 74px);
  width: 100%;
  /* min-width: 0; */
  /* overflow-x: hidden; */
`;

const TopNav = styled.nav`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 16px 0;
  background: transparent;
  z-index: 12;

  @media (max-width: 720px) {
    padding: 12px 0;
  }
`;

const TopNavInner = styled.div`
  width: 100%;
  max-width: 1220px;
  padding: 0 clamp(18px, 3vw, 40px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 720px) {
    padding: 0 16px;
  }
`;

const NavLeft = styled.div`
  display: flex;
  align-items: center;
  min-height: 42px;
`;

const NavTitle = styled.h1`
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  color: #3ee0a0;
  letter-spacing: 0.08em;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(38, 33, 31, 0.8);
  color: #e2e8f0;
  text-decoration: none;
  transition:
    border-color 0.12s ease,
    color 0.12s ease,
    transform 0.1s ease;
  font-size: 24px;
  line-height: 1;

  &:hover {
    border-color: #38bdf8;
    color: #38bdf8;
    transform: translateY(-1px);
  }
`;

const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const AvatarArea = styled.div`
  position: relative;
`;

const AvatarButton = styled.button`
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: #26211f;
  color: #e5e7eb;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 18px;

  &:hover {
    background: #45403d;
  }

  ${(props) =>
    props.$active &&
    `
    border-color: #4ae9a7;
  `}
`;

const AvatarIcon = styled.svg``;

const AvatarMenu = styled.div`
  position: absolute;
  top: 52px;
  right: 0;
  background: rgba(36, 32, 30, 0.95);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 8px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
`;

const MenuHeader = styled.div`
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const UserName = styled.p`
  margin: 0;
  font-weight: 700;
  color: #e5e7eb;
`;

const UserEmail = styled.p`
  margin: 2px 0 0 0;
  font-size: 12px;
  color: #a1a1aa;
`;

const MenuButton = styled.button`
  all: unset;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  color: ${(props) => (props.$danger ? "#f87171" : "#e2e8f0")};
  display: flex;
  align-items: center;

  &:hover {
    background: rgba(59, 130, 246, 0.12);
  }
`;

const MenuIcon = styled.svg`
  margin-right: 8px;
`;

const MenuBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10;
`;
