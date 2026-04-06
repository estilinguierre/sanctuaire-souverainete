import React from "react";
import { Prism as SH } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  code: string;
  language?: string;
}

export function SyntaxHighlighter({ code, language = "text" }: Props) {
  return (
    <SH
      style={vscDarkPlus}
      language={language}
      PreTag="div"
      customStyle={{
        borderRadius: "8px",
        fontSize: "0.75rem",
        margin: "0.5rem 0",
      }}
    >
      {code}
    </SH>
  );
}
