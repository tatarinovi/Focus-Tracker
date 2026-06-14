import { useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Note } from "@/data/mockData";
import { Plus, Trash2, Bold, Italic, Strikethrough, Code, Heading1, Quote, List, ListOrdered, Table, CheckSquare, Eye, Edit, Columns, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'data-cbindex'],
  });
}

function renderMarkdown(md: string): string {
  let cbIndex = 0;

  let html = md
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-3 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-2 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/~~(.+?)~~/g, '<del class="line-through">$1</del>')
    .replace(/`([^`]+)`/g, '<code class="bg-secondary px-1 rounded text-xs font-mono">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-primary pl-3 text-muted-foreground italic my-1">$1</blockquote>')
    .replace(/^- \[x\] (.+)$/gm, (_match, text) => {
      const idx = cbIndex++;
      return `<div class="flex items-center gap-2 my-0.5"><input type="checkbox" checked data-cbindex="${idx}" class="accent-primary cursor-pointer w-3.5 h-3.5"><span class="line-through text-muted-foreground">${text}</span></div>`;
    })
    .replace(/^- \[ \] (.+)$/gm, (_match, text) => {
      const idx = cbIndex++;
      return `<div class="flex items-center gap-2 my-0.5"><input type="checkbox" data-cbindex="${idx}" class="accent-primary cursor-pointer w-3.5 h-3.5"><span>${text}</span></div>`;
    })
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/^---$/gm, '<hr class="border-border my-3">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre class="bg-secondary rounded-lg p-3 text-xs font-mono my-2 overflow-x-auto">$1</pre>')
    .replace(/^\|(.+)\|$/gm, (_match, row) => {
      const cells = row.split('|').map((c: string) => c.trim());
      return '<tr>' + cells.map((c: string) => `<td class="border border-border px-2 py-1 text-xs">${c}</td>`).join('') + '</tr>';
    });

  html = html.replace(/(<tr>.*<\/tr>\n?)+/gs, (match) => `<table class="border-collapse my-2 w-full">${match}</table>`);

  html = html.split('\n').map(line => {
    if (line.startsWith('<') || line.trim() === '') return line;
    return `<p class="text-sm leading-relaxed my-0.5">${line}</p>`;
  }).join('\n');

  return sanitizeHtml(html);
}

type EditorMode = 'edit' | 'preview' | 'split';

export default function NotesPage() {
  const { state, dispatch, ensureNotesLoaded } = useApp();
  const { notes } = state;
  const [selectedId, setSelectedId] = useState<number | string | null>(notes[0]?.id ?? null);
  const [mode, setMode] = useState<EditorMode>('edit');
  const [saved, setSaved] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedNote = notes.find(n => n.id === selectedId);

  useEffect(() => {
    ensureNotesLoaded();
  }, [ensureNotesLoaded]);

  useEffect(() => {
    if (!selectedId && notes[0]) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  const updateNote = (partial: Partial<Note>) => {
    if (!selectedNote) return;
    const nextNote = { ...selectedNote, ...partial, updatedAt: new Date().toISOString() };
    dispatch({ type: 'UPDATE_NOTE', note: nextNote });
    window.api?.saveNote({ id: selectedNote.id, title: nextNote.title, content: nextNote.content }).catch(() => {});
    setSaved(false);
    setTimeout(() => setSaved(true), 1000);
  };

  const createNote = () => {
    const note = { title: 'Новая заметка', content: '# Новая заметка\n\n', updatedAt: new Date().toISOString() };
    dispatch({ type: 'CREATE_NOTE', note });
    window.api?.saveNote({ title: note.title, content: note.content }).then(() => ensureNotesLoaded(true)).catch(() => {});
    setSelectedId(note.title);
    toast.success('Заметка создана');
  };

  const deleteNote = (id: number | string) => {
    dispatch({ type: 'DELETE_NOTE', id });
    window.api?.deleteNote(id).then(() => ensureNotesLoaded(true)).catch(() => {});
    if (selectedId === id) setSelectedId(notes.find(n => n.id !== id)?.id ?? null);
    toast.success('Заметка удалена');
  };

  const insertText = (before: string, after = '') => {
    const ta = textareaRef.current;
    if (!ta || !selectedNote) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = selectedNote.content.substring(start, end);
    const newContent = selectedNote.content.substring(0, start) + before + selected + after + selectedNote.content.substring(end);
    updateNote({ content: newContent });
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length + after.length);
    }, 10);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' || (target as HTMLInputElement).type !== 'checkbox') return;
    e.preventDefault();
    const cbIndex = parseInt(target.getAttribute('data-cbindex') ?? '0', 10);
    if (!selectedNote) return;
    let count = 0;
    const newContent = selectedNote.content.replace(/^- \[([ x])\] (.+)$/gm, (match, checked, text) => {
      if (count === cbIndex) {
        count++;
        return `- [${checked === 'x' ? ' ' : 'x'}] ${text}`;
      }
      count++;
      return match;
    });
    updateNote({ content: newContent });
  };

  const formatDate = (dt: string) => {
    return new Date(dt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-full">
      <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-sidebar">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Заметки</span>
          <button
            data-testid="button-new-note"
            onClick={createNote}
            className="p-1 rounded hover:bg-secondary transition-colors"
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {notes.map(note => (
            <div
              key={note.id}
              data-testid={`note-item-${note.id}`}
              onClick={() => setSelectedId(note.id)}
              className={`px-2.5 py-2 rounded-lg cursor-pointer transition-colors group flex items-start justify-between gap-1 ${selectedId === note.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'}`}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{note.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(note.updatedAt)}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedNote ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
            <input
              value={selectedNote.title}
              onChange={e => updateNote({ title: e.target.value })}
              className="text-sm font-semibold bg-transparent border-none outline-none flex-1 max-w-60"
              placeholder="Название заметки..."
            />
            <div className="flex items-center gap-2">
              <span className={`text-[11px] transition-colors ${saved ? 'text-muted-foreground' : 'text-yellow-500'}`}>
                {saved ? 'Сохранено' : 'Сохранение...'}
              </span>
              <div className="flex bg-secondary rounded-md p-0.5 gap-0.5">
                {([['edit', 'Редактор', Edit], ['preview', 'Просмотр', Eye], ['split', 'Split', Columns]] as const).map(([m, label, Icon]) => (
                  <button
                    key={m}
                    data-testid={`button-mode-${m}`}
                    onClick={() => setMode(m)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(mode === 'edit' || mode === 'split') && (
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap">
              {[
                { icon: Bold, label: 'Жирный', action: () => insertText('**', '**'), title: 'Ctrl+B' },
                { icon: Italic, label: 'Курсив', action: () => insertText('*', '*'), title: 'Ctrl+I' },
                { icon: Strikethrough, label: 'Зачёркнутый', action: () => insertText('~~', '~~') },
                { icon: Code, label: 'Код', action: () => insertText('`', '`'), title: 'Ctrl+K' },
                { icon: Heading1, label: 'Заголовок', action: () => insertText('# ') },
                { icon: Quote, label: 'Цитата', action: () => insertText('> ') },
                { icon: List, label: 'Список', action: () => insertText('- ') },
                { icon: ListOrdered, label: 'Нумерованный', action: () => insertText('1. ') },
                { icon: CheckSquare, label: 'Чекбокс', action: () => insertText('- [ ] ') },
                { icon: LinkIcon, label: 'Ссылка', action: () => insertText('[', '](https://)'), title: 'Ctrl+L' },
                { icon: Table, label: 'Таблица', action: () => insertText('| Столбец 1 | Столбец 2 |\n|-----------|----------|\n| Ячейка   | Ячейка   |') },
              ].map(({ icon: Icon, label, action, title }) => (
                <button
                  key={label}
                  onClick={action}
                  title={title || label}
                  className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {(mode === 'edit' || mode === 'split') && (
              <div className={`${mode === 'split' ? 'w-1/2 border-r border-border' : 'w-full'} flex flex-col overflow-hidden`}>
                <textarea
                  ref={textareaRef}
                  data-testid="textarea-note-content"
                  value={selectedNote.content}
                  onChange={e => updateNote({ content: e.target.value })}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); insertText('**', '**'); }
                    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); insertText('*', '*'); }
                    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); insertText('`', '`'); }
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); toast.success('Сохранено'); }
                  }}
                  className="flex-1 resize-none bg-transparent p-4 text-sm font-mono leading-relaxed focus:outline-none scrollbar-thin"
                  placeholder="Начните писать в формате Markdown..."
                  spellCheck={false}
                />
              </div>
            )}
            {(mode === 'preview' || mode === 'split') && (
              <div
                className="flex-1 p-4 overflow-y-auto scrollbar-thin prose prose-sm max-w-none"
                style={{ color: 'hsl(var(--foreground))' }}
                onClick={handlePreviewClick}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedNote.content) }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <p className="text-sm text-muted-foreground mb-3">Выберите заметку или создайте новую</p>
            <button onClick={createNote} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
              <Plus className="w-4 h-4 inline mr-1" /> Новая заметка
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
