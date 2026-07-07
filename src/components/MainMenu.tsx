import { useEffect, useRef, useState } from "react";
import "../css/MainMenu.css";

const links = [
  { label: "about me", href: "#about" },
  { label: "projects", href: "#projects" },
  { label: "gallery", href: "#gallery" },
] as const;

export function MainMenu() {
  const [index, setIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const selectIndex = (nextIndex: number) => {
    selectedIndexRef.current = nextIndex;
    setIndex(nextIndex);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();

        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          (selectedIndexRef.current + direction + links.length) % links.length;

        selectedIndexRef.current = nextIndex;
        setIndex(nextIndex);
        itemRefs.current[nextIndex]?.focus();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        itemRefs.current[selectedIndexRef.current]?.click();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <nav className="main-menu" aria-label="Primary">
        {links.map((link, linkIndex) => (
          <a
            key={link.href}
            ref={(node) => {
              itemRefs.current[linkIndex] = node;
            }}
            href={link.href}
            className={`main-menu__item ${
              linkIndex === index ? "menu-sel" : ""
            }`}
            aria-current={linkIndex === index ? "page" : undefined}
            onFocus={() => selectIndex(linkIndex)}
            onMouseEnter={() => selectIndex(linkIndex)}
          >
            <span className="worn lbl">{link.label}</span>
          </a>
        ))}
      </nav>

      <div className="main-menu__hints" aria-hidden="true">
        <b>&uarr;</b>
        <b>&darr;</b> navigate <b>enter</b> select
      </div>
    </>
  );
}
