import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark-dimmed.min.css';
import { FONTS } from '../styles/theme.js';
import { CollapsibleThinking } from './CollapsibleThinking.js';

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeRaw, rehypeHighlight];

/** Extract <details><summary>Thinking</summary>...</details> blocks from content. */
function extractThinking(content: string): { thinking: string | null; rest: string } {
  const match = content.match(
    /^<details>\s*\n<summary>Thinking<\/summary>\s*\n\n([\s\S]*?)\n\n<\/details>\s*\n\n/,
  );
  if (match) {
    return { thinking: match[1], rest: content.slice(match[0].length) };
  }
  // Also handle old blockquote format
  const bqMatch = content.match(/^> \*Thinking:\*\n((?:>.*\n)*)\n?/);
  if (bqMatch) {
    const thinking = bqMatch[1]
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    return { thinking, rest: content.slice(bqMatch[0].length) };
  }
  return { thinking: null, rest: content };
}

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
