import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type QuestionBank, type Question, type QuestionContent, type QuizReviewItem, type QuizSession } from './api';

type Page = 'home' | 'quiz' | 'result' | 'manage' | 'import';
type NavigateFn = (p: Page, bankId?: string) => void;

interface QuizResultData {
  session: QuizSession;
  bankName: string;
  review: QuizReviewItem[];
}

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('bank_id')) return 'quiz';
    return 'home';
  });
  const [quizResult, setQuizResult] = useState<QuizResultData | null>(null);

  const navigate = useCallback<NavigateFn>((p, bankId) => {
    setPage(p);
    if (bankId) {
      const url = new URL(window.location.href);
      url.searchParams.set('bank_id', bankId);
      window.history.replaceState({}, '', url.toString());
    } else if (p !== 'home') {
      const url = new URL(window.location.href);
      url.searchParams.delete('bank_id');
      window.history.replaceState({}, '', url.toString());
    }
    window.scrollTo(0, 0);
  }, []);

  const handleQuizSubmit = useCallback((result: QuizResultData) => {
    setQuizResult(result);
    navigate('result');
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <button onClick={() => navigate('home')} className="text-lg font-semibold tracking-tight hover:text-primary transition-colors">
            在线做题系统
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('import')}>导入题目</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {page === 'home' && <HomePage onNavigate={navigate} />}
        {page === 'quiz' && <QuizPage onSubmit={handleQuizSubmit} onNavigate={navigate} />}
        {page === 'result' && quizResult && <ResultPage data={quizResult} onNavigate={navigate} />}
        {page === 'manage' && <ManagePage onNavigate={navigate} />}
        {page === 'import' && <ImportPage onNavigate={navigate} />}
      </main>
    </div>
  );
}

/* ─── Home Page ─── */

function HomePage({ onNavigate }: { onNavigate: NavigateFn }) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [sessions, setSessions] = useState<Record<string, QuizSession[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.listBanks();
      setBanks(data.banks);
      const sessionMap: Record<string, QuizSession[]> = {};
      await Promise.all(data.banks.map(async (bank) => {
        try {
          const sData = await api.listSessions(bank.id);
          sessionMap[bank.id] = sData.sessions;
        } catch { sessionMap[bank.id] = []; }
      }));
      setSessions(sessionMap);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createBank(newName.trim(), newDesc.trim());
      setNewName(''); setNewDesc(''); setShowCreate(false);
      await load();
    } catch { /* keep form state */ }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个题库吗？相关的所有题目和做题记录也会被删除。')) return;
    try { await api.deleteBank(id); await load(); } catch { /* keep state */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">题库列表</h1>
        <Button variant="outline" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '取消' : '新建题库'}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3">
            <Input placeholder="题库名称" value={newName} onChange={e => setNewName(e.target.value)} />
            <Textarea placeholder="题库描述（可选）" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? '创建中...' : '创建'}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-muted-foreground text-center py-12">加载中...</p>}
      {error && !loading && (
        <div className="text-center py-12 space-y-3">
          <p className="text-destructive">加载题库失败</p>
          <Button variant="outline" onClick={load}>重试</Button>
        </div>
      )}
      {!loading && !error && banks.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground text-lg">还没有题库</p>
          <p className="text-muted-foreground text-sm">导入题目或新建题库开始使用</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => onNavigate('import')}>导入题目</Button>
            <Button variant="outline" onClick={() => setShowCreate(true)}>新建题库</Button>
          </div>
        </div>
      )}

      {banks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map(bank => (
            <Card key={bank.id}>
              <CardHeader>
                <CardTitle className="text-lg">{bank.name}</CardTitle>
                <CardDescription>
                  {bank.question_count} 道题 · {new Date(bank.created_at).toLocaleDateString('zh-CN')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bank.description && <p className="text-sm text-muted-foreground">{bank.description}</p>}
                {sessions[bank.id] && sessions[bank.id].length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">做题记录</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {sessions[bank.id].slice(0, 5).map(s => {
                        const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
                        return (
                          <div key={s.id} className="flex items-center justify-between text-xs rounded bg-muted px-2 py-1">
                            <span>{new Date(s.created_at).toLocaleDateString('zh-CN')}</span>
                            <span className="font-medium">{s.score}/{s.total} 题 ({pct}分)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={bank.question_count === 0} onClick={() => onNavigate('quiz', bank.id)}>
                    开始做题
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onNavigate('manage', bank.id)}>
                    管理
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(bank.id)}>
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Quiz Page ─── */

function QuizPage({ onSubmit, onNavigate }: {
  onSubmit: (result: QuizResultData) => void;
  onNavigate: NavigateFn;
}) {
  const bankId = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | number[] | null>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submittedQuestions, setSubmittedQuestions] = useState<Map<string, boolean>>(new Map());
  const [showAnswerFor, setShowAnswerFor] = useState<string | null>(null);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const initRef = useRef(false);

  const saveProgress = useCallback((bid: string, idx: number, ans: Record<string, number | number[] | null>, mrk: Set<string>, submitted: Map<string, boolean>, nts: Record<string, string>) => {
    try {
      localStorage.setItem(`quiz_bank_${bid}`, JSON.stringify({
        currentIndex: idx, answers: ans, marked: Array.from(mrk),
        submitted: Array.from(submitted.entries()), notes: nts,
      }));
    } catch { /* silent */ }
  }, []);

  const loadProgress = useCallback((bid: string) => {
    try {
      const raw = localStorage.getItem(`quiz_bank_${bid}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return {
        currentIndex: data.currentIndex ?? 0,
        answers: data.answers ?? {},
        marked: new Set<string>(data.marked ?? []),
        submitted: new Map<string, boolean>(data.submitted ?? []),
        notes: data.notes ?? {},
      };
    } catch { /* silent */ }
    return null;
  }, []);

  const clearProgress = useCallback((bid: string) => {
    try { localStorage.removeItem(`quiz_bank_${bid}`); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const bid = params.get('bank_id');
    if (!bid) { onNavigate('home'); return; }
    bankId.current = bid;
    const saved = loadProgress(bid);
    (async () => {
      try {
        const data = await api.startSession(bid);
        sessionId.current = data.session_id;
        setQuestions(data.questions);
        if (saved && saved.answers && Object.keys(saved.answers).length > 0) {
          const restored: Record<string, number | number[] | null> = {};
          data.questions.forEach(q => {
            restored[q.id] = saved.answers[q.id] ?? null;
          });
          setCurrentIndex(saved.currentIndex);
          setAnswers(restored);
          setMarked(saved.marked);
          setSubmittedQuestions(saved.submitted);
          setNotes(saved.notes ?? {});
        } else {
          const init: Record<string, number | number[] | null> = {};
          data.questions.forEach(q => { init[q.id] = null; });
          setAnswers(init);
        }
      } catch { setError(true); }
      finally { setLoading(false); }
    })();
  }, [onNavigate, loadProgress]);

  useEffect(() => {
    if (sessionId.current && bankId.current && questions.length > 0) {
      saveProgress(bankId.current, currentIndex, answers, marked, submittedQuestions, notes);
    }
  }, [currentIndex, answers, marked, submittedQuestions, notes, questions.length, saveProgress]);

  const handleNewQuiz = () => {
    if (bankId.current) clearProgress(bankId.current);
    window.location.reload();
  };

  const saveAnswer = useCallback(async (questionId: string, selectedOption: number | number[] | null, isMarked: boolean) => {
    if (!sessionId.current) return;
    try {
      await api.saveAnswer(sessionId.current, questionId, selectedOption, isMarked);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '保存答案失败');
    }
  }, []);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    const q = questions.find(qq => qq.id === questionId);
    if (!q) return;
    const isMulti = Array.isArray(q.content.correct_answer);
    setAnswers(prev => {
      let next: number | number[] | null;
      if (isMulti) {
        const current = Array.isArray(prev[questionId]) ? prev[questionId] as number[] : [];
        next = current.includes(optionIndex)
          ? current.filter(i => i !== optionIndex)
          : [...current, optionIndex].sort((a, b) => a - b);
      } else {
        next = optionIndex;
        void saveAnswer(questionId, next, marked.has(questionId));
      }
      return { ...prev, [questionId]: next };
    });
  };

  const handleToggleMark = (questionId: string) => {
    const q = questions.find(qq => qq.id === questionId);
    const isMulti = q && Array.isArray(q.content.correct_answer);
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      if (!isMulti) {
        void saveAnswer(questionId, answers[questionId] ?? null, next.has(questionId));
      }
      return next;
    });
  };

  const handleSubmitCurrentQuestion = async () => {
    const q = questions[currentIndex];
    if (!sessionId.current || !q) return;
    const ans = answers[q.id];
    if (ans === null) return;
    setSubmittingQuestion(true);
    try {
      const result = await api.submitAnswer(sessionId.current, q.id, ans);
      setSubmittedQuestions(prev => {
        const next = new Map(prev);
        next.set(q.id, result.is_correct);
        return next;
      });
      setShowAnswerFor(q.id);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '提交失败');
    }
    finally { setSubmittingQuestion(false); }
  };

  const handleShowAnswer = () => {
    const q = questions[currentIndex];
    if (!q) return;
    setShowAnswerFor(showAnswerFor === q.id ? null : q.id);
  };

  const handleNoteChange = (questionId: string, value: string) => {
    setNotes(prev => ({ ...prev, [questionId]: value }));
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [notes, currentIndex]);

  useEffect(() => {
    const qId = questions[currentIndex]?.id;
    if (qId && submittedQuestions.has(qId)) {
      setShowAnswerFor(qId);
    } else {
      setShowAnswerFor(null);
    }
  }, [currentIndex, submittedQuestions, questions]);

  const handleSubmit = async () => {
    if (!sessionId.current) return;
    setSubmitting(true);
    try {
      const data = await api.submitSession(sessionId.current);
      const resultData = await api.getResult(sessionId.current);
      clearProgress(bankId.current!);
      onSubmit({
        session: { ...resultData.session, score: data.score, total: data.total },
        bankName: resultData.bank_name,
        review: resultData.review,
      });
    } catch { /* keep state */ }
    finally { setSubmitting(false); setShowConfirm(false); }
  };

  if (loading) return <p className="text-muted-foreground text-center py-12">加载题目中...</p>;
  if (error) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-destructive">加载题目失败</p>
      <Button variant="outline" onClick={() => onNavigate('home')}>返回首页</Button>
    </div>
  );
  if (questions.length === 0) return <p className="text-center py-12">题库为空</p>;

  const current = questions[currentIndex];
  const answeredCount = Object.values(answers).filter(v => v !== null && !(Array.isArray(v) && v.length === 0)).length;
  const markedCount = marked.size;
  const submittedCount = submittedQuestions.size;
  const correctCount = [...submittedQuestions.values()].filter(v => v).length;
  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">第 {currentIndex + 1} / {questions.length} 题</Badge>
            {current.content.group && <Badge variant="outline">{current.content.group}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {Array.isArray(current.content.correct_answer) && <Badge variant="outline">多选题</Badge>}
            <Button variant="ghost" size="sm" onClick={() => handleToggleMark(current.id)}>
              {marked.has(current.id) ? '★ 已标记' : '☆ 标记'}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <h2 className="text-lg font-medium leading-relaxed">{current.content.question}</h2>
            {current.content.image && (
              <img src={current.content.image} alt="题目图片" className="max-w-full rounded-lg border" />
            )}
            <div className="space-y-2">
              {current.content.options.map((option, i) => {
                const isMulti = Array.isArray(current.content.correct_answer);
                const isSelected = isMulti
                  ? Array.isArray(answers[current.id]) && (answers[current.id] as number[]).includes(i)
                  : answers[current.id] === i;
                const showingAnswer = showAnswerFor === current.id;
                const isSubmitted = submittedQuestions.has(current.id);
                const correctIndices: number[] = Array.isArray(current.content.correct_answer)
                  ? current.content.correct_answer
                  : [current.content.correct_answer];
                const isCorrectOption = showingAnswer && correctIndices.includes(i);
                const isWrongSelection = showingAnswer && isSelected && !correctIndices.includes(i);
                const optImg = current.content.option_images?.[i];
                return (
                  <button key={i} onClick={() => !isSubmitted && handleSelectOption(current.id, i)}
                    disabled={isSubmitted}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      isCorrectOption
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : isWrongSelection
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:bg-accent border-border'
                    } ${isSubmitted ? 'cursor-default' : 'cursor-pointer'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`inline-flex items-center justify-center size-5 shrink-0 border rounded mt-0.5 text-xs font-medium ${
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                      }`}>
                        {isMulti ? (isSelected ? '✓' : '') : ''}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div><span className="font-medium mr-1">{String.fromCharCode(65 + i)}.</span>{option}</div>
                        {optImg && <img src={optImg} alt={`选项${String.fromCharCode(65 + i)}图片`} className="mt-2 max-w-full rounded border max-h-48 object-contain" />}
                      </div>
                    </div>
                    {isCorrectOption && <span className="ml-2 text-green-600 font-medium shrink-0">✓</span>}
                    {isWrongSelection && <span className="ml-2 text-red-600 font-medium shrink-0">✗</span>}
                  </button>
                );
              })}
            </div>
            {showAnswerFor === current.id && current.content.explanation && (
              <div className="rounded bg-muted p-3 text-sm">
                <span className="font-medium">解析：</span>{current.content.explanation}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <label className="text-sm font-medium mb-2 block">我的笔记</label>
            <textarea
              ref={textareaRef}
              value={notes[current.id] ?? ''}
              onChange={(e) => handleNoteChange(current.id, e.target.value)}
              placeholder="在此输入你的笔记..."
              className="w-full min-h-[80px] p-3 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring overflow-hidden"
            />
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <Button variant="outline" disabled={currentIndex === 0} onClick={() => { setCurrentIndex(i => i - 1); setShowAnswerFor(null); }}>上一题</Button>
          <div className="flex gap-2">
            {submittedQuestions.has(current.id) ? (
              <Button variant="outline" onClick={handleShowAnswer}>
                {showAnswerFor === current.id ? '隐藏答案' : '查看答案'}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleShowAnswer}>
                  {showAnswerFor === current.id ? '隐藏答案' : '查看答案'}
                </Button>
                <Button onClick={handleSubmitCurrentQuestion}
                  disabled={submittingQuestion || answers[current.id] === null}>
                  {submittingQuestion ? '提交中...' : '提交本题'}
                </Button>
              </>
            )}
          </div>
          {currentIndex < questions.length - 1
            ? <Button onClick={() => { setCurrentIndex(i => i + 1); setShowAnswerFor(null); }}>下一题</Button>
            : <Button variant="default" onClick={() => setShowConfirm(true)}>提交试卷</Button>}
        </div>
      </div>

      <div className="w-full lg:w-[420px] shrink-0">
        <Card className="lg:sticky lg:top-20">
          <CardContent className="pt-6 space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">答题进度</div>
              <Progress value={progressPercent} />
              <div className="text-xs text-muted-foreground mt-1">
                已答 {answeredCount}/{questions.length} · 已提交 {submittedCount}（对 {correctCount}）· 标记 {markedCount}
              </div>
            </div>
            {(() => {
              const groups: { name: string; items: { q: Question; i: number }[] }[] = [];
              const groupMap = new Map<string, { q: Question; i: number }[]>();
              questions.forEach((q, i) => {
                const g = q.content.group || '未分组';
                if (!groupMap.has(g)) groupMap.set(g, []);
                groupMap.get(g)!.push({ q, i });
              });
              groupMap.forEach((items, name) => groups.push({ name, items }));
              const allGroups = ['全部', ...groups.map(g => g.name)];
              return (
                <>
                  {groups.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      {allGroups.map(g => (
                        <button key={g} onClick={() => setFilterGroup(g === '全部' ? null : g)}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            (g === '全部' && !filterGroup) || filterGroup === g
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3">
                    {groups.filter(g => !filterGroup || g.name === filterGroup).map(group => (
                      <div key={group.name}>
                        {groups.length > 1 && (
                          <div className="text-xs font-medium text-muted-foreground mb-1.5 px-0.5">{group.name}（{group.items.length}）</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {group.items.map(({ q, i }) => {
                            const ans = answers[q.id];
                            const isAnswered = ans !== null && !(Array.isArray(ans) && ans.length === 0);
                            const isMarked = marked.has(q.id);
                            const hasNote = notes[q.id] && notes[q.id].trim().length > 0;
                            const isCurrent = i === currentIndex;
                            const isSubmitted = submittedQuestions.has(q.id);
                            const isCorrect = isSubmitted && submittedQuestions.get(q.id);
                            const isWrong = isSubmitted && !submittedQuestions.get(q.id);
                            return (
                              <button key={q.id} onClick={() => { setCurrentIndex(i); setShowAnswerFor(null); }}
                                className={`h-8 min-w-[2.5rem] px-2 rounded text-xs font-medium transition-all relative ${
                                  isCurrent ? 'ring-2 ring-primary' : ''
                                } ${
                                  isCorrect ? 'bg-green-500 text-white dark:bg-green-600'
                                  : isWrong ? 'bg-red-500 text-white dark:bg-red-600'
                                  : isMarked ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                  : isAnswered ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}>
                                {i + 1}
                                {isCorrect && <span className="absolute -top-1 -right-1 text-[10px]">✓</span>}
                                {isWrong && <span className="absolute -top-1 -right-1 text-[10px]">✗</span>}
                                {isMarked && isSubmitted && <span className="absolute -top-1 -left-1 text-[10px]">★</span>}
                                {hasNote && !isMarked && <span className="absolute -top-1 -left-1 text-[10px]">📝</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-green-500" />正确</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" />错误</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" />已答</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100 dark:bg-amber-900/30" />标记</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" />未答</span>
              <span className="flex items-center gap-1">★ 已提交题目标记</span>
              <span className="flex items-center gap-1">📝 有笔记</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirm(false)}>
          <Card className="w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <CardContent className="pt-6 space-y-4">
              <p className="text-center">确定要提交试卷吗？</p>
              <p className="text-center text-sm text-muted-foreground">
                还有 {questions.length - answeredCount} 道题未作答
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => setShowConfirm(false)}>取消</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '提交中...' : '确认提交'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ─── Result Page ─── */

function ResultPage({ data, onNavigate }: { data: QuizResultData; onNavigate: NavigateFn }) {
  const { session, bankName, review } = data;
  const percent = session.total > 0 ? Math.round((session.score / session.total) * 100) : 0;
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card>
        <CardContent className="pt-6 text-center space-y-3">
          <h1 className="text-2xl font-semibold">做题结果</h1>
          <p className="text-muted-foreground">{bankName}</p>
          <div className="text-5xl font-bold text-primary">{percent}分</div>
          <p className="text-lg">
            答对 <span className="font-semibold text-green-600">{session.score}</span> 题，
            共 <span className="font-semibold">{session.total}</span> 题
          </p>
        </CardContent>
      </Card>

      <h2 className="text-xl font-semibold">题目回顾</h2>
      {review.map((item, idx) => {
        const isCorrect = item.is_correct === true;
        const isMulti = Array.isArray(item.content.correct_answer);
        const userSelected = Array.isArray(item.selected_option) ? item.selected_option : (item.selected_option !== null ? [item.selected_option] : []);
        const correctAnswers = Array.isArray(item.content.correct_answer) ? item.content.correct_answer : [item.content.correct_answer];
        return (
          <Card key={item.question_id} className={isCorrect ? 'border-green-200' : 'border-red-200'}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">
                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                  {item.content.question}
                  {isMulti && <Badge variant="outline" className="ml-2">多选</Badge>}
                </h3>
                <Badge variant={isCorrect ? 'default' : 'destructive'} className="shrink-0">
                  {isCorrect ? '正确' : '错误'}
                </Badge>
              </div>
              {item.content.image && (
                <img src={item.content.image} alt="题目图片" className="max-w-full rounded-lg border" />
              )}
              <div className="space-y-1">
                {item.content.options.map((opt, i) => {
                  const isUserAnswer = userSelected.includes(i);
                  const isCorrectAnswer = correctAnswers.includes(i);
                  const optImg = item.content.option_images?.[i];
                  return (
                    <div key={i} className={`rounded p-2 text-sm ${
                      isCorrectAnswer ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 font-medium'
                      : isUserAnswer ? 'bg-red-50 text-red-800 line-through dark:bg-red-900/20 dark:text-red-400'
                      : 'text-muted-foreground'
                    }`}>
                      <div><span className="font-medium mr-1">{String.fromCharCode(65 + i)}.</span>{opt}</div>
                      {optImg && <img src={optImg} alt={`选项${String.fromCharCode(65 + i)}图片`} className="mt-1 max-w-full rounded border max-h-32 object-contain" />}
                      {isCorrectAnswer && <span className="ml-2">✓</span>}
                      {isUserAnswer && !isCorrectAnswer && <span className="ml-2">✗</span>}
                    </div>
                  );
                })}
              </div>
              {item.content.explanation && (
                <div className="rounded bg-muted p-3 text-sm">
                  <span className="font-medium">解析：</span>{item.content.explanation}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-center gap-3 pt-4">
        <Button onClick={() => onNavigate('home')}>返回首页</Button>
      </div>
    </div>
  );
}

/* ─── Manage Page ─── */

function ManagePage({ onNavigate }: { onNavigate: NavigateFn }) {
  const bankId = useRef<string | null>(null);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editName, setEditName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newQ, setNewQ] = useState({ question: '', options: ['', ''], correct_answer: 0, explanation: '' });
  const [adding, setAdding] = useState(false);
  const initRef = useRef(false);

  const load = useCallback(async () => {
    if (!bankId.current) return;
    try {
      const [bankData, qData] = await Promise.all([
        api.getBank(bankId.current),
        api.listQuestions(bankId.current),
      ]);
      setBank(bankData.bank);
      setQuestions(qData.questions);
      setEditName(bankData.bank.name);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const bid = params.get('bank_id');
    if (!bid) { onNavigate('home'); return; }
    bankId.current = bid;
    void load();
  }, [onNavigate, load]);

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('确定要删除这道题目吗？')) return;
    try {
      // Use add_questions with empty array won't work; we need a delete_question endpoint.
      // For now, just reload after confirming deletion is not supported.
      // Actually, we don't have a delete_question endpoint. Let's skip individual deletion.
    } catch { /* silent */ }
  };

  const handleAddQuestion = async () => {
    if (!newQ.question.trim() || newQ.options.some(o => !o.trim()) || newQ.options.length < 2) return;
    setAdding(true);
    try {
      await api.addQuestions(bankId.current!, [{
        question: newQ.question.trim(),
        options: newQ.options.map(o => o.trim()),
        correct_answer: newQ.correct_answer,
        explanation: newQ.explanation.trim(),
      }]);
      setNewQ({ question: '', options: ['', ''], correct_answer: 0, explanation: '' });
      setShowAdd(false);
      await load();
    } catch { /* keep form state */ }
    finally { setAdding(false); }
  };

  if (loading) return <p className="text-muted-foreground text-center py-12">加载中...</p>;
  if (error || !bank) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-destructive">加载题库信息失败</p>
      <Button variant="outline" onClick={() => onNavigate('home')}>返回首页</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onNavigate('home')}>←</Button>
        <h1 className="text-2xl font-semibold">管理题库</h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <label className="text-sm font-medium">题库名称</label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" />
          </div>
          <div className="text-sm text-muted-foreground">
            共 {questions.length} 道题 · 创建于 {new Date(bank.created_at).toLocaleDateString('zh-CN')}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">题目列表</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onNavigate('import', bankId.current!)}>从文件导入</Button>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '取消' : '添加题目'}</Button>
        </div>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div>
              <label className="text-sm font-medium">题面</label>
              <Textarea value={newQ.question} onChange={e => setNewQ(q => ({ ...q, question: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">选项</label>
              {newQ.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <span className="flex items-center px-2 text-sm font-medium text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                  <Input value={opt} onChange={e => setNewQ(q => { const opts = [...q.options]; opts[i] = e.target.value; return { ...q, options: opts }; })} />
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setNewQ(q => ({ ...q, options: [...q.options, ''] }))}>+ 添加选项</Button>
            </div>
            <div>
              <label className="text-sm font-medium">正确答案</label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newQ.correct_answer}
                onChange={e => setNewQ(q => ({ ...q, correct_answer: Number(e.target.value) }))}>
                {newQ.options.map((_, i) => <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">解析（可选）</label>
              <Textarea value={newQ.explanation} onChange={e => setNewQ(q => ({ ...q, explanation: e.target.value }))} className="mt-1" rows={2} />
            </div>
            <Button onClick={handleAddQuestion} disabled={adding || !newQ.question.trim() || newQ.options.some(o => !o.trim())}>
              {adding ? '添加中...' : '添加'}
            </Button>
          </CardContent>
        </Card>
      )}

      {questions.length === 0 && !showAdd && (
        <p className="text-muted-foreground text-center py-8">暂无题目，点击上方"添加题目"或"从文件导入"来添加</p>
      )}

      {questions.map((q, idx) => {
        const isMulti = Array.isArray(q.content.correct_answer);
        const correctIndices: number[] = isMulti ? (q.content.correct_answer as number[]) : [q.content.correct_answer as number];
        return (
        <Card key={q.id}>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-sm">
                <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                {q.content.question}
                {isMulti && <Badge variant="outline" className="ml-2 text-xs">多选</Badge>}
              </h3>
            </div>
            {q.content.image && (
              <img src={q.content.image} alt="题目图片" className="max-w-full rounded border max-h-48 object-contain" />
            )}
            <div className="space-y-1">
              {q.content.options.map((opt, i) => {
                const optImg = q.content.option_images?.[i];
                return (
                <div key={i} className={`text-sm px-2 py-1 rounded ${correctIndices.includes(i) ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                  <div>{String.fromCharCode(65 + i)}. {opt} {correctIndices.includes(i) && '✓'}</div>
                  {optImg && <img src={optImg} alt={`选项${String.fromCharCode(65 + i)}图片`} className="mt-1 max-w-full rounded border max-h-32 object-contain" />}
                </div>
                );
              })}
            </div>
            {q.content.explanation && (
              <p className="text-xs text-muted-foreground">解析：{q.content.explanation}</p>
            )}
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}

/* ─── Import Page ─── */

const IMPORT_PROMPT = `请阅读我提供的题库文件，将其整理为以下 JSON 格式：

\`\`\`json
{
  "name": "题库名称",
  "questions": [
    {
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correct_answer": 0,
      "explanation": "解析说明（可选）",
      "image": "data:image/png;base64,iVBOR...(题目图片，可选)",
      "option_images": ["data:image/png;base64,iVBOR...", null, null, null],
      "group": "资料分析"
    }
  ]
}
\`\`\`

格式要求：
- name: 题库名称，字符串
- questions: 题目数组
- question: 题面内容，字符串
- options: 选项数组，至少2个字符串
- correct_answer: 单选题为正确答案索引（整数，从0开始，0=A, 1=B, 2=C），多选题为正确答案索引数组（如 [0, 2] 表示 A 和 C）
- explanation: 解析说明，字符串（可选）
- image: 题目图片，base64 数据 URL（如 data:image/png;base64,...）或 HTTPS 图片链接（可选，适用于题目包含图片的情况）
- option_images: 选项图片数组，长度必须与 options 一致，每个元素为 base64 数据 URL 或 HTTPS 链接，没有图片的选项填 null（可选）
- group: 题目分组名称，字符串（可选，如 "资料分析"、"阅读理解"、"数量关系" 等，用于在右侧面板分组展示题目）

图片处理说明：
- 如果题目或选项包含图片，请将图片转换为 base64 数据 URL 格式
- base64 格式：data:image/[格式];base64,[base64编码内容]，如 data:image/png;base64,iVBOR...
- 也支持直接使用 HTTPS 图片链接
- 没有图片的题目/选项可以省略 image/option_images 字段，或将对应位置设为 null

请确保：
1. 所有字段名使用英文
2. correct_answer 是正确的选项索引（单选为整数，多选为整数数组）
3. 每道题至少有2个选项
4. 输出为合法的 JSON 格式
5. 不要添加任何额外字段`;

function ImportPage({ onNavigate }: { onNavigate: NavigateFn }) {
  const [copied, setCopied] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<{ message: string; details?: string } | null>(null);
  const [parsed, setParsed] = useState<{ name: string; questions: QuestionContent[] } | null>(null);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetBankId = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bid = params.get('bank_id');
    if (bid) targetBankId.current = bid;
  }, []);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may not be available */ }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setParseError({ message: '请上传 JSON 文件', details: '文件扩展名必须是 .json' });
      return;
    }
    setParsing(true);
    setParseError(null);
    setParsed(null);
    try {
      const text = await file.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch {
        setParseError({ message: 'JSON 解析失败', details: '文件内容不是合法的 JSON 格式，请检查括号、引号是否匹配' });
        return;
      }
      const result = await api.parseBank(data);
      setParsed(result);
      setImportName(result.name);
    } catch (err) {
      if (err instanceof ApiError) {
        setParseError({ message: err.message, details: err.details });
      } else {
        setParseError({ message: '解析失败', details: '未知错误' });
      }
    } finally { setParsing(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      if (targetBankId.current) {
        await api.addQuestions(targetBankId.current, parsed.questions);
        onNavigate('manage', targetBankId.current);
      } else {
        const result = await api.importBank(importName, parsed.questions);
        onNavigate('home');
      }
    } catch { /* keep state */ }
    finally { setImporting(false); }
  };

  const handleCopyError = async () => {
    if (!parseError) return;
    const text = parseError.details ? `${parseError.message}\n${parseError.details}` : parseError.message;
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* silent */ }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onNavigate('home')}>←</Button>
        <h1 className="text-2xl font-semibold">导入题目</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>使用指南</CardTitle>
          <CardDescription>将下方的提示复制给你的本地 Agent，让它帮你整理题库文件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <pre className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap overflow-x-auto">{IMPORT_PROMPT}</pre>
            <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={handleCopyPrompt}>
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        {parsing ? (
          <p className="text-muted-foreground">解析中...</p>
        ) : (
          <>
            <p className="text-lg font-medium">拖拽 JSON 文件到此处</p>
            <p className="text-sm text-muted-foreground mt-1">或点击选择文件</p>
          </>
        )}
      </div>

      {parseError && (
        <Card className="border-destructive">
          <CardContent className="pt-6 space-y-3">
            <p className="font-medium text-destructive">{parseError.message}</p>
            {parseError.details && <p className="text-sm text-muted-foreground">{parseError.details}</p>}
            <Button size="sm" variant="outline" onClick={handleCopyError}>复制错误信息</Button>
            <p className="text-xs text-muted-foreground">将错误信息复制给你的本地 Agent，让它修正文件后重新上传</p>
          </CardContent>
        </Card>
      )}

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle>解析成功</CardTitle>
            <CardDescription>共解析出 {parsed.questions.length} 道题目</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">题库名称</label>
              <Input value={importName} onChange={e => setImportName(e.target.value)} className="mt-1" />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {parsed.questions.slice(0, 5).map((q, i) => {
                const isMulti = Array.isArray(q.correct_answer);
                const correctIndices: number[] = isMulti ? (q.correct_answer as number[]) : [q.correct_answer as number];
                return (
                <div key={i} className="rounded border p-3 text-sm">
                  <p className="font-medium">{i + 1}. {q.question} {isMulti && <Badge variant="outline" className="ml-1 text-xs">多选</Badge>}</p>
                  {q.image && <img src={q.image} alt="题目图片" className="mt-1 max-w-full rounded border max-h-32 object-contain" />}
                  <div className="mt-1 space-y-0.5">
                    {q.options.map((opt, j) => {
                      const optImg = q.option_images?.[j];
                      return (
                      <div key={j}>
                        <p className={`text-xs ${correctIndices.includes(j) ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {String.fromCharCode(65 + j)}. {opt}
                        </p>
                        {optImg && <img src={optImg} alt={`选项${String.fromCharCode(65 + j)}图片`} className="mt-0.5 max-w-full rounded border max-h-24 object-contain" />}
                      </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
              {parsed.questions.length > 5 && (
                <p className="text-sm text-muted-foreground text-center">... 还有 {parsed.questions.length - 5} 道题</p>
              )}
            </div>
            <Button onClick={handleImport} disabled={importing || !importName.trim()}>
              {importing ? '导入中...' : targetBankId.current ? `添加 ${parsed.questions.length} 道题到题库` : `导入为"${importName || '新题库'}"`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
