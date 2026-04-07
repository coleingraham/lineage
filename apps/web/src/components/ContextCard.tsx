import { useState, useEffect } from 'react';
import type { ContextSource, Node, Tree, NodeRepository } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';
import { RoleIcon, previewContent } from './graph/NodeCardShared.js';

interface SourceData {
  source: ContextSource;
  node: Node | null;
  tree: Tree | null;
}

export function ContextCard({
  contextSources,
  trees,
  repo,
  onNavigate,
}: {
  contextSources: ContextSource[];
  trees: Tree[];
  repo: NodeRepository;
  onNavigate: (treeId: string, nodeId: string) => void;
}) {
  const [sourceData, setSourceData] = useState<SourceData[]>([]);

  useEffect(() => {
    const treeById = new Map(trees.map((t) => [t.treeId, t]));

    let cancelled = false;
    Promise.all(
      contextSources.map(async (source): Promise<SourceData> => {
        try {
          const node = await repo.getNode(source.nodeId);
          return { source, node, tree: treeById.get(source.treeId) ?? null };
        } catch {
          return { source, node: null, tree: treeById.get(source.treeId) ?? null };
        }
      }),
    ).then((data) => {
      if (!cancelled) setSourceData(data);
    });

    return () => {
      cancelled = true;
    };
  }, [contextSources, trees, repo]);

  return (
    <div
      style={{
        background: COLORS.elevated,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '6px',
        padding: '10px 12px',
        marginBottom: '4px',
      }}
    >
      <div
        style={{
          fontSize: '9px',
          color: COLORS.textSecondary,
          fontFamily: FONTS.mono,
          letterSpacing: '0.08em',
          marginBottom: '8px',
        }}
      >
        CONTEXT
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {sourceData.map(({ source, node, tree }) => (
          <div
            key={`${source.treeId}:${source.nodeId}`}
            onClick={() => onNavigate(source.treeId, source.nodeId)}
            style={{
              flex: '1 1 calc(50% - 3px)',
              minWidth: '180px',
              maxWidth: '100%',
              padding: '8px 8px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
            }}
          >
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, marginTop: '1px' }}>
                <RoleIcon role={node?.type ?? 'summary'} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '8px',
                    color: '#444',
                    fontFamily: FONTS.mono,
                    letterSpacing: '0.06em',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tree?.title || 'Untitled'}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#777',
                    fontFamily: FONTS.mono,
                    lineHeight: '1.4',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {node ? previewContent(node.content).slice(0, 120) || '(empty)' : '(unavailable)'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
