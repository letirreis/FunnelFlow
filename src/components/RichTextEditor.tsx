import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';

// ─── Common emojis panel ─────────────────────────────────────────────────────
const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇',
  '🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
  '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩',
  '🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣',
  '👋','👍','👎','👏','🙌','👐','🤝','💪','🔥','⭐',
  '✅','❌','💡','🎯','🎉','🚀','💰','❤️','💙','💚',
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({ value, onChange, placeholder, className, minHeight = '2.5rem' }: RichTextEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const emojiRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync value from parent only when not focused (e.g. external update)
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  // Close emoji / image popups when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (imageRef.current && !imageRef.current.contains(e.target as Node)) {
        setShowImageInput(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!editor) return null;

  const insertEmoji = (emoji: string) => {
    editor.chain().focus().insertContent(emoji).run();
    setShowEmojiPicker(false);
  };

  const insertImage = () => {
    const url = imageUrl.trim();
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
    setImageUrl('');
    setShowImageInput(false);
  };

  const ToolbarBtn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`h-7 w-7 flex items-center justify-center rounded text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className={`rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden ${className ?? ''}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {/* Bold */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Negrito (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarBtn>

        {/* Italic */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Itálico (Ctrl+I)"
        >
          <em>I</em>
        </ToolbarBtn>

        {/* Underline */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Sublinhado (Ctrl+U)"
        >
          <span className="underline">U</span>
        </ToolbarBtn>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        {/* Align Left */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="Alinhar à esquerda"
        >
          <AlignLeftIcon />
        </ToolbarBtn>

        {/* Align Center */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="Centralizar"
        >
          <AlignCenterIcon />
        </ToolbarBtn>

        {/* Align Right */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="Alinhar à direita"
        >
          <AlignRightIcon />
        </ToolbarBtn>

        {/* Align Justify */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
          title="Justificado"
        >
          <AlignJustifyIcon />
        </ToolbarBtn>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        {/* Bullet list */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Lista com marcadores"
        >
          <BulletListIcon />
        </ToolbarBtn>

        {/* Ordered list */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Lista numerada"
        >
          <OrderedListIcon />
        </ToolbarBtn>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        {/* Emoji picker */}
        <div className="relative" ref={emojiRef}>
          <ToolbarBtn
            onClick={() => { setShowEmojiPicker(v => !v); setShowImageInput(false); }}
            active={showEmojiPicker}
            title="Inserir emoji"
          >
            😊
          </ToolbarBtn>
          {showEmojiPicker && (
            <div className="absolute left-0 top-8 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="grid grid-cols-10 gap-0.5">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="flex h-6 w-6 items-center justify-center rounded text-base hover:bg-slate-100 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Image insert */}
        <div className="relative" ref={imageRef}>
          <ToolbarBtn
            onClick={() => { setShowImageInput(v => !v); setShowEmojiPicker(false); }}
            active={showImageInput}
            title="Inserir imagem"
          >
            <ImageIcon />
          </ToolbarBtn>
          {showImageInput && (
            <div className="absolute left-0 top-8 z-50 flex w-72 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertImage(); } }}
                placeholder="https://exemplo.com/imagem.jpg"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={insertImage}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor content */}
      <div className="relative">
        {editor.isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-slate-400 select-none">
            {placeholder}
          </span>
        )}
        <EditorContent
          editor={editor}
          className={`prose prose-sm max-w-none px-3 py-2.5 text-sm text-slate-900 focus:outline-none min-h-[2.5rem] [&_.ProseMirror]:outline-none`}
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

const AlignLeftIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M2 3h12v1.5H2zm0 3.5h8v1.5H2zm0 3.5h12v1.5H2zm0 3.5h8v1.5H2z"/>
  </svg>
);

const AlignCenterIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M2 3h12v1.5H2zm2 3.5h8v1.5H4zm-2 3.5h12v1.5H2zm2 3.5h8v1.5H4z"/>
  </svg>
);

const AlignRightIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M2 3h12v1.5H2zm4 3.5h8v1.5H6zm-4 3.5h12v1.5H2zm4 3.5h8v1.5H6z"/>
  </svg>
);

const AlignJustifyIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M2 3h12v1.5H2zm0 3.5h12v1.5H2zm0 3.5h12v1.5H2zm0 3.5h12v1.5H2z"/>
  </svg>
);

const ImageIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M14.5 2h-13A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0014.5 2zm-10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm9.5 7H2l4-5 2.5 3L11 8l3 4z"/>
  </svg>
);

const BulletListIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M2 4a1 1 0 110-2 1 1 0 010 2zm3-1.5h9v1.5H5zm0 4h9v1.5H5zm0 4h9v1.5H5zM2 9a1 1 0 110-2 1 1 0 010 2zm0 4a1 1 0 110-2 1 1 0 010 2z"/>
  </svg>
);

const OrderedListIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
    <path d="M1 1h1.5v3H1zm0 4h2v1H2v.5h1V7H1zm0 4h2v.5H2V10H1zm3-8h9v1.5H4zm0 4h9v1.5H4zm0 4h9v1.5H4z"/>
  </svg>
);
