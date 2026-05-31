import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { COLORS } from '../styles/theme.js';

const remarkPlugins = [remarkGfm];

interface MarkdownProps {
  content: string;
  fontSize?: string;
  color?: string;
}

/** Lightweight markdown renderer for monologue prose (no AI-thinking handling). */
export function Markdown({ content, fontSize = '15px', color = COLORS.text }: MarkdownProps) {
  if (!content.trim()) {
    return <span style={{ color: '#383838', fontStyle: 'italic' }}>(empty)</span>;
  }
  return (
    <div className="markdown-body" style={{ fontSize, color, lineHeight: 1.6 }}>
      <ReactMarkdown remarkPlugins={remarkPlugins}>{content}</ReactMarkdown>
    </div>
  );
}
