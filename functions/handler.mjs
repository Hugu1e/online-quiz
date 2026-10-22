const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
});

function getAction(request) {
  return new URL(request.url).searchParams.get("action");
}

async function safeBody(request, maxSize = 1024 * 1024) {
  const text = await request.text();
  if (text.length > maxSize) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function handleQuiz({ request, supabase }) {
  const action = getAction(request);
  try {
    switch (action) {
      case "list_banks": return handleListBanks({ supabase });
      case "create_bank": return handleCreateBank({ request, supabase });
      case "get_bank": return handleGetBank({ request, supabase });
      case "delete_bank": return handleDeleteBank({ request, supabase });
      case "list_questions": return handleListQuestions({ request, supabase });
      case "parse_bank": return handleParseBank({ request });
      case "import_bank": return handleImportBank({ request, supabase });
      case "add_questions": return handleAddQuestions({ request, supabase });
      case "start_session": return handleStartSession({ request, supabase });
      case "save_answer": return handleSaveAnswer({ request, supabase });
      case "submit_session": return handleSubmitSession({ request, supabase });
      case "get_result": return handleGetResult({ request, supabase });
      case "list_sessions": return handleListSessions({ request, supabase });
      case "submit_answer": return handleSubmitAnswer({ request, supabase });
      default: return json({ error: "not_found" }, 404);
    }
  } catch {
    return json({ error: "database_request_failed" }, 503);
  }
}

async function handleListBanks({ supabase }) {
  const { data, error } = await supabase.from("question_banks")
    .select("id,name,description,question_count,created_at")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return json({ error: "database_request_failed" }, 503);
  return json({ banks: data });
}

async function handleCreateBank({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return json({ error: "invalid_name" }, 400);
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const { data, error } = await supabase.from("question_banks").insert({
    id: crypto.randomUUID(), name, description, question_count: 0, created_at: new Date().toISOString(),
  }).select("id,name,description,question_count,created_at").single();
  if (error || !data) return json({ error: "database_request_failed" }, 503);
  return json({ bank: data });
}

async function handleGetBank({ request, supabase }) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "missing_id" }, 400);
  const { data, error } = await supabase.from("question_banks")
    .select("id,name,description,question_count,created_at").eq("id", id).maybeSingle();
  if (error) return json({ error: "database_request_failed" }, 503);
  if (!data) return json({ error: "not_found" }, 404);
  return json({ bank: data });
}

async function handleDeleteBank({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "missing_id" }, 400);
  const { error } = await supabase.from("question_banks").delete().eq("id", id);
  if (error) return json({ error: "database_request_failed" }, 503);
  return json({ ok: true });
}

async function handleListQuestions({ request, supabase }) {
  const bankId = new URL(request.url).searchParams.get("bank_id");
  if (!bankId) return json({ error: "missing_bank_id" }, 400);
  const { data, error } = await supabase.from("questions")
    .select("id,bank_id,question_index,content")
    .eq("bank_id", bankId)
    .order("question_index", { ascending: true });
  if (error || !Array.isArray(data)) return json({ error: "database_request_failed" }, 503);
  return json({ questions: data });
}

async function handleParseBank({ request }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request, 5 * 1024 * 1024);
  if (body === null) return json({ error: "invalid_body", message: "请求体无效或超过5MB大小限制" }, 400);
  const result = parseQuestionBank(body);
  if ("error" in result) return json({ error: "parse_error", message: result.error, details: result.details }, 400);
  return json(result);
}

async function handleImportBank({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request, 5 * 1024 * 1024);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const { name, questions } = body;
  if (!Array.isArray(questions) || questions.length === 0) return json({ error: "invalid_questions" }, 400);
  const bankName = typeof name === "string" && name.trim() ? name.trim() : "未命名题库";
  const bankId = crypto.randomUUID();
  const { error: bankError } = await supabase.from("question_banks").insert({
    id: bankId, name: bankName, description: "", question_count: questions.length, created_at: new Date().toISOString(),
  });
  if (bankError) return json({ error: "database_request_failed" }, 503);
  const rows = questions.map((q, i) => ({
    id: crypto.randomUUID(), bank_id: bankId, question_index: i, content: q, created_at: new Date().toISOString(),
  }));
  const { error: qError } = await supabase.from("questions").insert(rows);
  if (qError) return json({ error: "database_request_failed" }, 503);
  return json({ ok: true, bank_id: bankId, question_count: questions.length });
}

async function handleAddQuestions({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request, 5 * 1024 * 1024);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const { bank_id, questions } = body;
  if (typeof bank_id !== "string") return json({ error: "invalid_bank_id" }, 400);
  if (!Array.isArray(questions) || questions.length === 0) return json({ error: "invalid_questions" }, 400);
  const { data: existing } = await supabase.from("questions")
    .select("question_index").eq("bank_id", bank_id)
    .order("question_index", { ascending: false }).limit(1);
  const nextIndex = existing && existing.length > 0 ? existing[0].question_index + 1 : 0;
  const rows = questions.map((q, i) => ({
    id: crypto.randomUUID(), bank_id, question_index: nextIndex + i, content: q, created_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("questions").insert(rows);
  if (error) return json({ error: "database_request_failed" }, 503);
  const { count, error: countError } = await supabase.from("questions")
    .select("id", { count: "exact" }).eq("bank_id", bank_id);
  if (!countError && count !== null) {
    await supabase.from("question_banks").update({ question_count: count }).eq("id", bank_id);
  }
  return json({ ok: true, added_count: questions.length });
}

async function handleStartSession({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const { bank_id } = body;
  if (typeof bank_id !== "string") return json({ error: "invalid_bank_id" }, 400);
  const { data: questions, error: qError } = await supabase.from("questions")
    .select("id,bank_id,question_index,content")
    .eq("bank_id", bank_id).order("question_index", { ascending: true });
  if (qError || !Array.isArray(questions) || questions.length === 0) return json({ error: "no_questions" }, 400);
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error: sError } = await supabase.from("quiz_sessions").insert({
    id: sessionId, bank_id, total: questions.length, score: 0, submitted: false, created_at: now,
  });
  if (sError) return json({ error: "database_request_failed" }, 503);
  const answers = questions.map(q => ({
    id: crypto.randomUUID(), session_id: sessionId, question_id: q.id,
    selected_option: null, marked: false, is_correct: null, created_at: now,
  }));
  const { error: aError } = await supabase.from("quiz_answers").insert(answers);
  if (aError) return json({ error: "database_request_failed" }, 503);
  return json({ session_id: sessionId, questions, total: questions.length });
}

async function handleSaveAnswer({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const { session_id, question_id, selected_option, marked } = body;
  if (typeof session_id !== "string" || typeof question_id !== "string") return json({ error: "invalid_params" }, 400);
  const updates = {};
  if (selected_option !== undefined) {
    if (selected_option === null) {
      updates.selected_option = selected_option;
    } else if (Number.isInteger(selected_option) && selected_option >= 0) {
      updates.selected_option = selected_option;
    } else if (Array.isArray(selected_option) && selected_option.every(v => Number.isInteger(v) && v >= 0)) {
      updates.selected_option = JSON.stringify(selected_option);
    } else {
      return json({ error: "invalid_option" }, 400);
    }
  }
  if (marked !== undefined) {
    if (typeof marked === "boolean") updates.marked = marked;
    else return json({ error: "invalid_marked" }, 400);
  }
  if (Object.keys(updates).length === 0) return json({ error: "no_updates" }, 400);
  const { error } = await supabase.from("quiz_answers").update(updates)
    .eq("session_id", session_id).eq("question_id", question_id);
  if (error) return json({ error: "database_request_failed" }, 503);
  return json({ ok: true });
}

async function handleSubmitSession({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const { session_id } = body;
  if (typeof session_id !== "string") return json({ error: "invalid_session_id" }, 400);
  const { data: session } = await supabase.from("quiz_sessions")
    .select("id,bank_id,submitted").eq("id", session_id).maybeSingle();
  if (!session) return json({ error: "session_not_found" }, 404);
  if (session.submitted) return json({ error: "already_submitted" }, 400);
  const { data: answers } = await supabase.from("quiz_answers")
    .select("id,question_id,selected_option").eq("session_id", session_id);
  if (!Array.isArray(answers)) return json({ error: "database_request_failed" }, 503);
  const questionIds = answers.map(a => a.question_id);
  const { data: questions } = await supabase.from("questions")
    .select("id,content").in("id", questionIds);
  if (!Array.isArray(questions)) return json({ error: "database_request_failed" }, 503);
  const qMap = new Map(questions.map(q => [q.id, q.content]));
  let score = 0;
  for (const answer of answers) {
    const q = qMap.get(answer.question_id);
    if (!q || q.correct_answer === undefined) continue;
    let selected = answer.selected_option;
    if (typeof selected === "string") {
      try { selected = JSON.parse(selected); } catch { selected = null; }
    }
    const correct = isAnswerCorrect(selected, q.correct_answer);
    if (correct) score++;
    const { error: uError } = await supabase.from("quiz_answers")
      .update({ is_correct: correct }).eq("id", answer.id);
    if (uError) return json({ error: "database_request_failed" }, 503);
  }
  const { error: sError } = await supabase.from("quiz_sessions")
    .update({ submitted: true, score }).eq("id", session_id);
  if (sError) return json({ error: "database_request_failed" }, 503);
  return json({ ok: true, score, total: answers.length });
}

async function handleGetResult({ request, supabase }) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return json({ error: "missing_session_id" }, 400);
  const { data: session } = await supabase.from("quiz_sessions")
    .select("id,bank_id,score,total,submitted,created_at").eq("id", sessionId).maybeSingle();
  if (!session) return json({ error: "session_not_found" }, 404);
  const { data: answers } = await supabase.from("quiz_answers")
    .select("question_id,selected_option,marked,is_correct").eq("session_id", sessionId);
  if (!Array.isArray(answers)) return json({ error: "database_request_failed" }, 503);
  const questionIds = answers.map(a => a.question_id);
  const { data: questions } = await supabase.from("questions")
    .select("id,question_index,content").in("id", questionIds)
    .order("question_index", { ascending: true });
  if (!Array.isArray(questions)) return json({ error: "database_request_failed" }, 503);
  const answerMap = new Map(answers.map(a => [a.question_id, a]));
  const review = questions.map(q => {
    const a = answerMap.get(q.id);
    let selected = a?.selected_option ?? null;
    if (typeof selected === "string") {
      try { selected = JSON.parse(selected); } catch { selected = null; }
    }
    return { question_id: q.id, question_index: q.question_index, content: q.content, selected_option: selected, marked: a?.marked ?? false, is_correct: a?.is_correct ?? null };
  });
  const { data: bank } = await supabase.from("question_banks")
    .select("name").eq("id", session.bank_id).maybeSingle();
  return json({ session, bank_name: bank?.name ?? "未知题库", review });
}

async function handleListSessions({ request, supabase }) {
  const bankId = new URL(request.url).searchParams.get("bank_id");
  if (!bankId) return json({ error: "missing_bank_id" }, 400);
  const { data, error } = await supabase.from("quiz_sessions")
    .select("id,bank_id,score,total,submitted,created_at")
    .eq("bank_id", bankId)
    .eq("submitted", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return json({ error: "database_request_failed" }, 503);
  const { data: bank } = await supabase.from("question_banks")
    .select("name").eq("id", bankId).maybeSingle();
  return json({ sessions: data, bank_name: bank?.name ?? "未知题库" });
}

function isAnswerCorrect(selected, correct) {
  if (Array.isArray(correct)) {
    if (!Array.isArray(selected)) return false;
    const s = new Set(selected);
    const c = new Set(correct);
    if (s.size !== c.size) return false;
    for (const v of c) { if (!s.has(v)) return false; }
    return true;
  }
  return selected === correct;
}

async function handleSubmitAnswer({ request, supabase }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await safeBody(request);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
  const { session_id, question_id, selected_option } = body;
  if (typeof session_id !== "string" || typeof question_id !== "string") return json({ error: "invalid_params" }, 400);
  if (selected_option === undefined || selected_option === null) return json({ error: "no_answer" }, 400);
  const { data: answer } = await supabase.from("quiz_answers")
    .select("id").eq("session_id", session_id).eq("question_id", question_id).maybeSingle();
  if (!answer) return json({ error: "answer_not_found" }, 404);
  const { data: question } = await supabase.from("questions")
    .select("content").eq("id", question_id).maybeSingle();
  if (!question) return json({ error: "question_not_found" }, 404);
  const content = question.content;
  let selected = selected_option;
  if (typeof selected === "string") {
    try { selected = JSON.parse(selected); } catch { selected = null; }
  }
  const correct = isAnswerCorrect(selected, content.correct_answer);
  const { error: uError } = await supabase.from("quiz_answers")
    .update({ is_correct: correct }).eq("id", answer.id);
  if (uError) return json({ error: "database_request_failed" }, 503);
  return json({ ok: true, is_correct: correct, correct_answer: content.correct_answer });
}

function parseQuestionBank(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "文件内容必须是 JSON 对象", details: "顶层结构应为 { \"name\": \"...\", \"questions\": [...] }" };
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) return { error: "缺少题库名称 (name)", details: "请在 JSON 顶层添加 \"name\" 字段，值为非空字符串" };
  if (!Array.isArray(data.questions)) {
    return { error: "缺少题目数组 (questions)", details: "请在 JSON 顶层添加 \"questions\" 字段，值为题目数组" };
  }
  if (data.questions.length === 0) {
    return { error: "题目数组为空", details: "questions 数组至少需要包含一道题目" };
  }
  const questions = [];
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];
    const prefix = `第 ${i + 1} 题`;
    if (!q || typeof q !== "object") return { error: `${prefix}格式错误`, details: "题目必须是 JSON 对象" };
    if (typeof q.question !== "string" || !q.question.trim()) return { error: `${prefix}缺少题面 (question)`, details: "每道题必须有 \"question\" 字段，值为非空字符串" };
    if (!Array.isArray(q.options) || q.options.length < 2) return { error: `${prefix}选项不足`, details: "每道题至少需要 2 个选项 (options 数组)" };
    for (let j = 0; j < q.options.length; j++) {
      if (typeof q.options[j] !== "string" || !q.options[j].trim()) return { error: `${prefix}第 ${j + 1} 个选项无效`, details: "所有选项必须是非空字符串" };
    }
    if (Number.isInteger(q.correct_answer)) {
      if (q.correct_answer < 0 || q.correct_answer >= q.options.length) {
        return { error: `${prefix}正确答案索引无效`, details: `correct_answer 必须是 0 到 ${q.options.length - 1} 之间的整数或整数数组` };
      }
    } else if (Array.isArray(q.correct_answer)) {
      if (q.correct_answer.length === 0) {
        return { error: `${prefix}正确答案不能为空`, details: "多选题的 correct_answer 数组至少需要一个元素" };
      }
      for (const idx of q.correct_answer) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) {
          return { error: `${prefix}正确答案索引无效`, details: `correct_answer 数组中的每个值必须是 0 到 ${q.options.length - 1} 之间的整数` };
        }
      }
    } else {
      return { error: `${prefix}正确答案格式错误`, details: "correct_answer 必须是整数（单选题）或整数数组（多选题）" };
    }
    if (q.image !== undefined && typeof q.image !== "string") {
      return { error: `${prefix}题目图片格式错误`, details: "image 字段必须是 base64 数据 URL 字符串（如 data:image/png;base64,...）或 HTTPS 图片链接" };
    }
    if (q.option_images !== undefined) {
      if (!Array.isArray(q.option_images)) {
        return { error: `${prefix}选项图片格式错误`, details: "option_images 必须是字符串数组" };
      }
      if (q.option_images.length !== q.options.length) {
        return { error: `${prefix}选项图片数量不匹配`, details: `option_images 数组长度 (${q.option_images.length}) 必须与选项数量 (${q.options.length}) 一致` };
      }
      for (let j = 0; j < q.option_images.length; j++) {
        if (typeof q.option_images[j] !== "string") {
          return { error: `${prefix}第 ${j + 1} 个选项图片无效`, details: "option_images 中的每个值必须是字符串" };
        }
      }
    }
    const qOut = {
      question: q.question.trim(),
      options: q.options.map(o => o.trim()),
      correct_answer: q.correct_answer,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
    };
    if (typeof q.image === "string" && q.image.trim()) qOut.image = q.image.trim();
    if (Array.isArray(q.option_images)) qOut.option_images = q.option_images;
    if (typeof q.group === "string" && q.group.trim()) qOut.group = q.group.trim();
    questions.push(qOut);
  }
  return { name, questions };
}
