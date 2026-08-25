"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 左の行き先。今どこにいるかが分かるように、開いているものに印を付ける。

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export default function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((item) => {
        const on =
          item.href === "/" ? path === "/" : path === item.href || path.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} className={`navlink${on ? " on" : ""}`}>
            <span className="ico" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.badge ? <span className="badge">{item.badge}</span> : null}
          </Link>
        );
      })}
    </>
  );
}
