import { Fragment } from "react";
import { toUnits } from "@/lib/ruby";

/** 漢字《かな》 を、漢字の上に小さくふりがなを付けて表示する */
export function RubyText({ text }: { text: string }) {
  return (
    <>
      {toUnits(text).map((u, i) =>
        u.ruby ? (
          <ruby key={i}>
            {u.base}
            <rt>{u.ruby}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{u.base}</Fragment>
        ),
      )}
    </>
  );
}
