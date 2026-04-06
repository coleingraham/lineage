import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark-dimmed.min.css';
import { extractThinking } from '@lineage/core';
import { FONTS } from '../styles/theme.js';
import { CollapsibleThinking } from './CollapsibleThinking.js';

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeRaw, rehypeHighlight];

interface MarkdownProps {
  content: string;
  fontSize?: string;
  color?: string;
}

export function Markdown({ content, fontSize = '15px', color = '#ececec' }: MarkdownProps) {
  if (!content) return <span style={{ color: '#383838', fontFamily: FONTS.mono }}>{'(empty)'}</span>;

  const { thinking, rest } = extractThinking(content);

  return (
    <div className="markdown-body" style={{ fontSize, color, lineHeight: 1.65 }}>
      {thinking && <CollapsibleThinking content={thinking} />}
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {rest}
      </ReactMarkdown>
    </div>
  );
}
