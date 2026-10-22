export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number = 0, public details?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requestJson(url: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError('网络请求失败，请检查网络连接', 'network_error');
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError('访问被拒绝', 'access_denied', response.status);
  }
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('服务返回了非预期响应', 'invalid_response', response.status);
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new ApiError('服务返回了无效数据', 'invalid_response', response.status); }
  const body = data && typeof data === 'object' ? data as Record<string, any> : null;
  const code = typeof body?.error === 'string' ? body.error
    : (!response.ok || body?.ok === false) && typeof body?.code === 'string' ? body.code
    : response.ok ? null : 'request_failed';
  if (!response.ok || body?.ok === false || code) {
    const resolved = code ?? 'request_failed';
    const message = typeof body?.message === 'string' ? body.message : '操作失败';
    const details = typeof body?.details === 'string' ? body.details : undefined;
    throw new ApiError(message, resolved, response.status, details);
  }
  return data;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  question_count: number;
  created_at: string;
}

export interface QuestionContent {
  question: string;
  options: string[];
  correct_answer: number | number[];
  explanation: string;
  image?: string;
  option_images?: string[];
  group?: string;
}

export interface Question {
  id: string;
  bank_id: string;
  question_index: number;
  content: QuestionContent;
}

export interface QuizSession {
  id: string;
  bank_id: string;
  score: number;
  total: number;
  submitted: boolean;
  created_at: string;
}

export interface QuizReviewItem {
  question_id: string;
  question_index: number;
  content: QuestionContent;
  selected_option: number | number[] | null;
  marked: boolean;
  is_correct: boolean | null;
}

export const api = {
  listBanks: () => requestJson('/functions/v1/app?action=list_banks') as Promise<{ banks: QuestionBank[] }>,

  createBank: (name: string, description: string) => requestJson('/functions/v1/app?action=create_bank', {
    method: 'POST', body: JSON.stringify({ name, description }),
  }) as Promise<{ bank: QuestionBank }>,

  getBank: (id: string) => requestJson(`/functions/v1/app?action=get_bank&id=${encodeURIComponent(id)}`) as Promise<{ bank: QuestionBank }>,

  deleteBank: (id: string) => requestJson(`/functions/v1/app?action=delete_bank&id=${encodeURIComponent(id)}`, {
    method: 'POST',
  }) as Promise<{ ok: boolean }>,

  listQuestions: (bankId: string) => requestJson(`/functions/v1/app?action=list_questions&bank_id=${encodeURIComponent(bankId)}`) as Promise<{ questions: Question[] }>,

  parseBank: (data: unknown) => requestJson('/functions/v1/app?action=parse_bank', {
    method: 'POST', body: JSON.stringify(data),
  }) as Promise<{ name: string; questions: QuestionContent[] }>,

  importBank: (name: string, questions: QuestionContent[]) => requestJson('/functions/v1/app?action=import_bank', {
    method: 'POST', body: JSON.stringify({ name, questions }),
  }) as Promise<{ ok: boolean; bank_id: string; question_count: number }>,

  addQuestions: (bankId: string, questions: QuestionContent[]) => requestJson('/functions/v1/app?action=add_questions', {
    method: 'POST', body: JSON.stringify({ bank_id: bankId, questions }),
  }) as Promise<{ ok: boolean; added_count: number }>,

  startSession: (bankId: string) => requestJson('/functions/v1/app?action=start_session', {
    method: 'POST', body: JSON.stringify({ bank_id: bankId }),
  }) as Promise<{ session_id: string; questions: Question[]; total: number }>,

  saveAnswer: (sessionId: string, questionId: string, selectedOption: number | number[] | null, marked: boolean) => requestJson('/functions/v1/app?action=save_answer', {
    method: 'POST', body: JSON.stringify({ session_id: sessionId, question_id: questionId, selected_option: selectedOption, marked }),
  }) as Promise<{ ok: boolean }>,

  submitSession: (sessionId: string) => requestJson('/functions/v1/app?action=submit_session', {
    method: 'POST', body: JSON.stringify({ session_id: sessionId }),
  }) as Promise<{ ok: boolean; score: number; total: number }>,

  getResult: (sessionId: string) => requestJson(`/functions/v1/app?action=get_result&session_id=${encodeURIComponent(sessionId)}`) as Promise<{ session: QuizSession; bank_name: string; review: QuizReviewItem[] }>,

  listSessions: (bankId: string) => requestJson(`/functions/v1/app?action=list_sessions&bank_id=${encodeURIComponent(bankId)}`) as Promise<{ sessions: QuizSession[]; bank_name: string }>,

  submitAnswer: (sessionId: string, questionId: string, selectedOption: number | number[] | null) => requestJson('/functions/v1/app?action=submit_answer', {
    method: 'POST', body: JSON.stringify({ session_id: sessionId, question_id: questionId, selected_option: selectedOption }),
  }) as Promise<{ ok: boolean; is_correct: boolean; correct_answer: number | number[] }>,
};
