import type { ReactNode } from 'react';

export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(<b>.*?<\/b>|<i>.*?<\/i>)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('<b>')) {
          return <strong key={i}>{part.slice(3, -4)}</strong>;
        }
        if (part.startsWith('<i>')) {
          return <em key={i}>{part.slice(3, -4)}</em>;
        }
        return part;
      })}
    </>
  );
}
