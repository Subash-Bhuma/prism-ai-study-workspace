import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  BookMarked,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileQuestion,
  FileText,
  Headphones,
  Library,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Send,
  Sparkles,
  SquareStack,
  Upload,
} from 'lucide-react';
import { api } from './api';

const STARTERS = [
  'Which methods appear most often in the past papers?',
  'Explain Bernoulli equations from my notes.',
  'What should I revise before the exam?',
];

const TOOL_META = {
  'study-guide': { label: 'Study guide', note: 'Structured from selected sources', icon: BookMarked },
  flashcards: { label: 'Flashcards', note: 'Fast concept recall', icon: SquareStack },
  quiz: { label: 'Practice quiz', note: 'Method recognition check', icon: FileQuestion },
};

function sourceLabel(resource) {
  if (resource.kind === 'Past papers') return 'PAST PAPER';
  if (resource.kind === 'Photo') return 'SCAN';
  return resource.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'NOTE';
}

function ArtifactView({ result }) {
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState({});
  useEffect(() => { setCardIndex(0); setFlipped(false); setAnswers({}); }, [result]);
  if (!result) return null;
  const { kind, artifact, ai } = result;

  if (kind === 'flashcards') {
    const cards = artifact.cards || [];
    const card = cards[cardIndex];
    return (
      <div className="artifact-view flashcard-artifact">
        <div className="artifact-head"><div><span>FLASHCARDS</span><h3>{artifact.title}</h3></div><small>{cardIndex + 1}/{cards.length}</small></div>
        {card && <button className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((value) => !value)}>
          <span>{flipped ? 'ANSWER' : 'PROMPT'}</span>
          <strong>{flipped ? card.back : card.front}</strong>
          <small>{flipped ? card.source : 'Select to reveal'}</small>
        </button>}
        <div className="artifact-pager">
          <button onClick={() => { setCardIndex((value) => Math.max(0, value - 1)); setFlipped(false); }} disabled={cardIndex === 0}><ChevronLeft size={16} /></button>
          <div>{cards.map((_, index) => <i key={index} className={index === cardIndex ? 'active' : ''} />)}</div>
          <button onClick={() => { setCardIndex((value) => Math.min(cards.length - 1, value + 1)); setFlipped(false); }} disabled={cardIndex >= cards.length - 1}><ChevronRight size={16} /></button>
        </div>
        <p className="artifact-model"><Sparkles size={12} /> {ai.active ? ai.model : 'Source-grounded fallback'}</p>
      </div>
    );
  }

  if (kind === 'quiz') {
    return (
      <div className="artifact-view quiz-artifact">
        <div className="artifact-head"><div><span>QUIZ</span><h3>{artifact.title}</h3></div><small>{Object.keys(answers).length}/{artifact.questions?.length || 0}</small></div>
        <div className="quiz-scroll">
          {(artifact.questions || []).map((question, qIndex) => (
            <section className="studio-question" key={question.prompt}>
              <strong><span>{qIndex + 1}</span>{question.prompt}</strong>
              <div>{question.options.map((option) => {
                const selected = answers[qIndex] === option;
                const answered = answers[qIndex] !== undefined;
                const correct = option === question.answer;
                return <button key={option} className={`${selected ? 'selected' : ''} ${answered && correct ? 'correct' : ''} ${answered && selected && !correct ? 'wrong' : ''}`} onClick={() => setAnswers((items) => ({ ...items, [qIndex]: option }))} disabled={answered}>{answered && correct && <Check size={12} />}{option}</button>;
              })}</div>
              {answers[qIndex] !== undefined && <p>{question.explanation}</p>}
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="artifact-view guide-artifact">
      <div className="artifact-head"><div><span>STUDY GUIDE</span><h3>{artifact.title}</h3></div></div>
      <p className="guide-summary">{artifact.summary}</p>
      {(artifact.sections || []).map((section) => <section key={section.heading}><strong>{section.heading}</strong><p>{section.content}</p></section>)}
      <div className="key-terms"><span>KEY TERMS</span>{(artifact.key_terms || []).map((term) => <p key={term}>{term}</p>)}</div>
    </div>
  );
}

export default function NotebookWorkspace({ subject, detail, onRefresh, pushToast, onView }) {
  const resources = detail?.resources || [];
  const inputRef = useRef(null);
  const [selected, setSelected] = useState([]);
  const [sourceQuery, setSourceQuery] = useState('');
  const [focusedSource, setFocusedSource] = useState(null);
  const [mode, setMode] = useState('conversation');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [notes, setNotes] = useState([]);
  const [artifact, setArtifact] = useState(null);
  const [studioLoading, setStudioLoading] = useState('');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSelected(resources.map((resource) => resource.id));
  }, [subject.id, resources.map((resource) => resource.id).join('|')]);

  useEffect(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      answer: `I have mapped this ${subject.name} notebook. Ask about a concept, compare the notes with past papers, or turn the material into practice.`,
      citations: [],
      follow_ups: STARTERS,
      ai: { active: false, model: 'Workspace index' },
    }]);
    setNotes([]);
    setArtifact(null);
  }, [subject.id]);

  const filteredResources = useMemo(() => resources.filter((resource) => resource.name.toLowerCase().includes(sourceQuery.toLowerCase())), [resources, sourceQuery]);
  const selectedResources = resources.filter((resource) => selected.includes(resource.id));

  function toggleSource(id) {
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  async function upload(files) {
    if (!files?.length) return;
    try {
      for (const file of files) await api.upload(subject.id, file);
      pushToast(`${files.length} source${files.length > 1 ? 's' : ''} added to the notebook.`);
      await onRefresh();
      window.setTimeout(onRefresh, 1800);
    } catch (error) {
      pushToast(error.message, 'error');
    }
  }

  async function ask(prompt = question) {
    const clean = prompt.trim();
    if (!clean || asking) return;
    if (!selected.length) return pushToast('Select at least one source.', 'error');
    const userMessage = { id: crypto.randomUUID(), role: 'user', answer: clean };
    setMessages((items) => [...items, userMessage]);
    setQuestion('');
    setAsking(true);
    try {
      const response = await api.ask(subject.id, { question: clean, resource_ids: selected });
      setMessages((items) => [...items, { ...response, id: crypto.randomUUID(), role: 'assistant' }]);
    } catch (error) {
      pushToast(error.message, 'error');
    } finally {
      setAsking(false);
    }
  }

  function saveNote(message) {
    const note = { id: crypto.randomUUID(), title: message.answer.split(/[.!?]/)[0].slice(0, 58), content: message.answer };
    setNotes((items) => [note, ...items]);
    pushToast('Response saved to notebook notes.');
  }

  async function createArtifact(kind) {
    if (!selected.length) return pushToast('Select at least one source.', 'error');
    setStudioLoading(kind);
    try {
      setArtifact(await api.studio(subject.id, kind, selected));
    } catch (error) {
      pushToast(error.message, 'error');
    } finally {
      setStudioLoading('');
    }
  }

  function toggleAudio() {
    if (!('speechSynthesis' in window)) return pushToast('Audio overview is unavailable in this browser.', 'error');
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const latest = [...messages].reverse().find((message) => message.role === 'assistant')?.answer;
    const utterance = new SpeechSynthesisUtterance(latest || `Your ${subject.name} notebook is ready. Start by classifying each equation before choosing a method.`);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <div className="notebook-workspace">
      <aside className="sources-pane">
        <header><div><Library size={17} /><strong>Sources</strong><span>{selected.length}/{resources.length}</span></div><button onClick={() => inputRef.current?.click()} title="Add sources"><Plus size={17} /></button></header>
        <input ref={inputRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onChange={(event) => upload(event.target.files)} />
        <label className="source-search"><Search size={14} /><input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Search sources" /></label>
        <label className="select-all-source"><input type="checkbox" checked={selected.length === resources.length && resources.length > 0} onChange={() => setSelected(selected.length === resources.length ? [] : resources.map((resource) => resource.id))} /><span>Select all sources</span></label>
        <div className="source-list">
          {filteredResources.map((resource) => (
            <article className={`${focusedSource?.id === resource.id ? 'focused' : ''}`} key={resource.id}>
              <label><input type="checkbox" checked={selected.includes(resource.id)} onChange={() => toggleSource(resource.id)} /></label><span className={`source-type ${resource.status}`}><FileText size={15} /></span><button className="source-name" onClick={() => setFocusedSource(resource)}><strong>{resource.name}</strong><small>{sourceLabel(resource)} · {resource.pages || 1} pages</small></button>
              <button className="source-more" title="Source details" onClick={() => setFocusedSource(resource)}><MoreHorizontal size={15} /></button>
            </article>
          ))}
        </div>
        {focusedSource && <div className="source-inspector"><button onClick={() => setFocusedSource(null)}>Close</button><span>{sourceLabel(focusedSource)}</span><strong>{focusedSource.name}</strong><p>{focusedSource.detail}</p></div>}
        <button className="add-source-button" onClick={() => inputRef.current?.click()}><Upload size={15} /> Add source</button>
      </aside>

      <main className="notebook-main">
        <header className="notebook-header">
          <div><p>{subject.code} · SOURCE NOTEBOOK</p><h1>{subject.name}</h1></div>
          <div className="notebook-mode"><button className={mode === 'conversation' ? 'active' : ''} onClick={() => setMode('conversation')}><MessageSquareText size={15} /> Conversation</button><button className={mode === 'notes' ? 'active' : ''} onClick={() => setMode('notes')}><NotebookPen size={15} /> Notes <span>{notes.length}</span></button></div>
        </header>

        {mode === 'conversation' ? <>
          <div className="conversation-stream">
            {messages.map((message) => message.role === 'user' ? <div className="user-message" key={message.id}><p>{message.answer}</p></div> : (
              <article className="prism-message" key={message.id}>
                <div className="prism-message-mark"><Sparkles size={16} /></div>
                <div className="prism-answer">
                  {message.answer.split('\n').filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  {!!message.citations?.length && <div className="citation-row">{message.citations.map((citation, index) => <button key={`${citation.source_id}-${index}`} onClick={() => setFocusedSource(resources.find((resource) => resource.id === citation.source_id))}><span>{index + 1}</span>{citation.source_name}</button>)}</div>}
                  <div className="answer-actions"><span><i className={message.ai?.active ? 'live' : ''} />{message.ai?.active ? message.ai.model : 'Source-grounded'}</span>{message.id !== 'welcome' && <button onClick={() => saveNote(message)}><NotebookPen size={13} /> Save to notes</button>}</div>
                  {!!message.follow_ups?.length && <div className="follow-up-row">{message.follow_ups.map((item) => <button key={item} onClick={() => ask(item)}>{item}</button>)}</div>}
                </div>
              </article>
            ))}
            {asking && <article className="prism-message thinking"><div className="prism-message-mark"><LoaderCircle className="spin" size={16} /></div><div><strong>Reading {selected.length} sources</strong><span>Tracing the answer back to your material</span></div></article>}
          </div>
          <div className="notebook-composer">
            <div className="selected-context">{selectedResources.slice(0, 3).map((resource) => <span key={resource.id}><FileText size={11} />{resource.name.replace(/\.[^.]+$/, '')}</span>)}{selected.length > 3 && <span>+{selected.length - 3}</span>}</div>
            <div><textarea rows="1" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); } }} placeholder="Ask your sources..." /><button onClick={() => ask()} disabled={!question.trim() || asking} title="Ask Prism"><Send size={17} /></button></div>
            <small>{selected.length} sources selected · Answers include citations</small>
          </div>
        </> : <div className="notes-canvas">
          <div className="notes-title"><div><p>STUDY NOTES</p><h2>Saved from your source work</h2></div><button onClick={() => setNotes((items) => [{ id: crypto.randomUUID(), title: 'Untitled note', content: '' }, ...items])}><Plus size={15} /> New note</button></div>
          {notes.length ? notes.map((note) => <article key={note.id}><input value={note.title} onChange={(event) => setNotes((items) => items.map((item) => item.id === note.id ? { ...item, title: event.target.value } : item))} /><textarea value={note.content} onChange={(event) => setNotes((items) => items.map((item) => item.id === note.id ? { ...item, content: event.target.value } : item))} /><span>Saved in this notebook</span></article>) : <div className="notes-empty"><NotebookPen size={25} /><strong>No saved notes yet</strong><button onClick={() => setMode('conversation')}>Return to conversation</button></div>}
        </div>}
      </main>

      <aside className="studio-pane">
        <header><div><Sparkles size={17} /><strong>Studio</strong></div><button onClick={() => setArtifact(null)} title="Clear studio"><MoreHorizontal size={16} /></button></header>
        {!artifact && <>
          <button className={`audio-tool ${speaking ? 'active' : ''}`} onClick={toggleAudio}><span><Headphones size={18} /></span><div><strong>{speaking ? 'Playing overview' : 'Audio overview'}</strong><small>{speaking ? 'Select to stop' : 'Listen to the current synthesis'}</small></div><AudioLines size={17} /></button>
          <div className="studio-tools">
            {Object.entries(TOOL_META).map(([kind, meta]) => { const Icon = meta.icon; return <button key={kind} onClick={() => createArtifact(kind)} disabled={!!studioLoading}><span><Icon size={17} /></span><div><strong>{meta.label}</strong><small>{meta.note}</small></div>{studioLoading === kind ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}</button>; })}
          </div>
          <div className="studio-evidence"><CheckCircle2 size={16} /><div><strong>{selected.length} sources in context</strong><span>Responses will cite only selected material.</span></div></div>
          <button className="practice-launch" onClick={() => onView('practice')}><span><CircleAlert size={17} /></span><div><strong>Continue adaptive practice</strong><small>Bernoulli equations · 20 min</small></div><ChevronRight size={16} /></button>
        </>}
        {artifact && <><button className="back-to-studio" onClick={() => setArtifact(null)}><ChevronLeft size={14} /> Studio tools</button><ArtifactView result={artifact} /></>}
      </aside>
    </div>
  );
}
