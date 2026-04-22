__version__ = "2.1.0"

"""AI Proxy 客戶端封裝

把這個檔案放到你的專案裡，直接 import 使用：

    from proxy import ai

    # Claude
    print(ai("寫一個 hello world", provider="claude"))

    # Gemini
    print(ai("解釋什麼是 gRPC", provider="gemini"))

    # 指定模型
    print(ai("翻譯成英文", provider="claude", model="opus"))

    # 指定專案（用量會分開統計）
    print(ai("分析資料", project="work-A"))
    print(ai("寫文案", project="work-B"))

    # 指定小組（在專案內細分用量）
    print(ai("寫前端", project="work-A", group="frontend"))
    print(ai("寫 API", project="work-A", group="backend"))

    # 用模型等級（tier）— 不用記模型名，新模型出來改 .env 就好
    print(ai("複雜分析", tier="high"))                     # claude-opus-4-6
    print(ai("一般任務", tier="mid"))                      # claude-sonnet-4-6
    print(ai("簡單問答", tier="fast"))                     # claude-haiku-4-5
    print(ai("用 Gemini", tier="high", provider="gemini")) # gemini-2.5-pro

    # 圖片理解（Claude + Gemini 都支援）
    print(ai("描述這張圖片", image="photo.jpg", project="work-A"))
    print(ai("比較這兩張圖", images=["a.png", "b.png"], project="work-A"))

    # 文件理解（PDF，Claude + Gemini 都支援）
    print(ai("摘要這份文件", file="report.pdf", project="work-A"))

    # 音訊理解（Gemini 支援）
    print(ai("翻譯這段錄音", file="meeting.mp3", provider="gemini", project="work-A"))

    # 影片理解（Gemini 支援）
    print(ai("描述影片內容", file="demo.mp4", provider="gemini", project="work-A"))

    # 雙 AI 比較決策
    from proxy import ai_dual
    result = ai_dual("這段程式碼有安全問題嗎？", project="work-A")
    print("Claude:", result["claude"]["content"][:100])
    print("Gemini:", result["gemini"]["content"][:100])

    # 激活用量（系統專案，不需預先建立，不計入一般統計）
    print(ai("激活測試", project="_activation"))
"""
import os
import sys

# 自動找到同目錄的 pb2 檔案
_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _DIR)

# 自動載入 .env（同目錄或上層目錄）
def _load_dotenv():
    for d in [_DIR, os.path.dirname(_DIR), os.getcwd()]:
        env_path = os.path.join(d, ".env")
        if os.path.isfile(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, val = line.partition("=")
                    key, val = key.strip(), val.strip()
                    if val and key not in os.environ:
                        os.environ[key] = val
            break
_load_dotenv()

import grpc
import aiproxy_pb2 as pb
import aiproxy_pb2_grpc as rpc

# === 設定 ===
# 外網 TLS：cli.twloop.com:443（推薦）  外網無 TLS：cli.twloop.com:50051
PROXY_HOST = os.environ.get("AI_PROXY_HOST") or os.environ.get("AI_PROXY_GRPC_HOST", "cli.twloop.com")
PROXY_PORT = os.environ.get("AI_PROXY_PORT") or os.environ.get("AI_PROXY_GRPC_PORT", "443")
PROXY_TLS = os.environ.get("AI_PROXY_TLS", "true").lower() in ("true", "1", "yes")
PROXY_TOKEN = os.environ.get("AI_PROXY_TOKEN", "改成你的token")
DEFAULT_PROJECT = os.environ.get("AI_PROXY_PROJECT", "")
DEFAULT_GROUP = os.environ.get("AI_PROXY_GROUP", "")
# Server-side tier 解析（true=tier 交給 server 解析，不在本地對應模型名）
USE_SERVER_TIER = os.environ.get("AI_PROXY_SERVER_TIER", "false").lower() in ("true", "1", "yes")

# 預設 provider 和模型（可在 .env 設定）
DEFAULT_PROVIDER = os.environ.get("AI_PROXY_PROVIDER", "claude")
DEFAULT_MODELS = {
    "claude": os.environ.get("AI_PROXY_CLAUDE_MODEL", "sonnet"),
    "gemini": os.environ.get("AI_PROXY_GEMINI_MODEL", "gemini-2.5-flash"),
    "openai": os.environ.get("AI_PROXY_OPENAI_MODEL", "gpt-4o-mini"),
    "deepseek": os.environ.get("AI_PROXY_DEEPSEEK_MODEL", "deepseek-chat"),
    "mistral": os.environ.get("AI_PROXY_MISTRAL_MODEL", "mistral-small-latest"),
    "groq": os.environ.get("AI_PROXY_GROQ_MODEL", "llama-3.3-70b-versatile"),
    "xai": os.environ.get("AI_PROXY_XAI_MODEL", "grok-3-mini"),
    "together": os.environ.get("AI_PROXY_TOGETHER_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo"),
    "fireworks": os.environ.get("AI_PROXY_FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p3-70b-instruct"),
    "cohere": os.environ.get("AI_PROXY_COHERE_MODEL", "command-r-plus"),
}

# 模型等級對應表（可在 .env 覆蓋，新模型出來改 .env 就好）
# Claude: https://platform.claude.com/docs/en/about-claude/models/overview
# Gemini: https://ai.google.dev/gemini-api/docs/pricing
# OpenAI: https://platform.openai.com/docs/models
MODEL_TIERS = {
    "claude": {
        "high":   os.environ.get("AI_PROXY_CLAUDE_HIGH", "claude-opus-4-6"),
        "mid":    os.environ.get("AI_PROXY_CLAUDE_MID", "claude-sonnet-4-6"),
        "fast":   os.environ.get("AI_PROXY_CLAUDE_FAST", "claude-haiku-4-5"),
    },
    "gemini": {
        "high":   os.environ.get("AI_PROXY_GEMINI_HIGH", "gemini-2.5-pro"),
        "mid":    os.environ.get("AI_PROXY_GEMINI_MID", "gemini-2.5-flash"),
        "fast":   os.environ.get("AI_PROXY_GEMINI_FAST", "gemini-2.5-flash-lite"),
    },
    "openai": {
        "high":   os.environ.get("AI_PROXY_OPENAI_HIGH", "gpt-4o"),
        "mid":    os.environ.get("AI_PROXY_OPENAI_MID", "gpt-4o-mini"),
        "fast":   os.environ.get("AI_PROXY_OPENAI_FAST", "gpt-4o-mini"),
    },
    "deepseek": {
        "high":   os.environ.get("AI_PROXY_DEEPSEEK_HIGH", "deepseek-reasoner"),
        "mid":    os.environ.get("AI_PROXY_DEEPSEEK_MID", "deepseek-chat"),
        "fast":   os.environ.get("AI_PROXY_DEEPSEEK_FAST", "deepseek-chat"),
    },
    "mistral": {
        "high":   os.environ.get("AI_PROXY_MISTRAL_HIGH", "mistral-large-latest"),
        "mid":    os.environ.get("AI_PROXY_MISTRAL_MID", "mistral-small-latest"),
        "fast":   os.environ.get("AI_PROXY_MISTRAL_FAST", "mistral-small-latest"),
    },
    "groq": {
        "high":   os.environ.get("AI_PROXY_GROQ_HIGH", "llama-3.3-70b-versatile"),
        "mid":    os.environ.get("AI_PROXY_GROQ_MID", "llama-3.1-8b-instant"),
        "fast":   os.environ.get("AI_PROXY_GROQ_FAST", "llama-3.1-8b-instant"),
    },
    "xai": {
        "high":   os.environ.get("AI_PROXY_XAI_HIGH", "grok-3"),
        "mid":    os.environ.get("AI_PROXY_XAI_MID", "grok-3-mini"),
        "fast":   os.environ.get("AI_PROXY_XAI_FAST", "grok-3-mini"),
    },
    "together": {
        "high":   os.environ.get("AI_PROXY_TOGETHER_HIGH", "meta-llama/Llama-3.3-70B-Instruct-Turbo"),
        "mid":    os.environ.get("AI_PROXY_TOGETHER_MID", "meta-llama/Llama-3.3-70B-Instruct-Turbo"),
        "fast":   os.environ.get("AI_PROXY_TOGETHER_FAST", "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"),
    },
    "fireworks": {
        "high":   os.environ.get("AI_PROXY_FIREWORKS_HIGH", "accounts/fireworks/models/llama-v3p3-70b-instruct"),
        "mid":    os.environ.get("AI_PROXY_FIREWORKS_MID", "accounts/fireworks/models/llama-v3p3-70b-instruct"),
        "fast":   os.environ.get("AI_PROXY_FIREWORKS_FAST", "accounts/fireworks/models/llama-v3p1-8b-instruct"),
    },
    "cohere": {
        "high":   os.environ.get("AI_PROXY_COHERE_HIGH", "command-r-plus"),
        "mid":    os.environ.get("AI_PROXY_COHERE_MID", "command-r"),
        "fast":   os.environ.get("AI_PROXY_COHERE_FAST", "command-r"),
    },
}

_channel = None
_stub = None

# === Session 用量追蹤 ===
class _Session:
    """追蹤本次 Python 進程的累計用量"""
    def __init__(self):
        self.requests = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.errors = 0
        self._start = __import__("time").time()

    def track(self, input_tokens=0, output_tokens=0, error=False):
        self.requests += 1
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        if error:
            self.errors += 1

    @property
    def total_tokens(self):
        return self.input_tokens + self.output_tokens

    @property
    def duration_s(self):
        return __import__("time").time() - self._start

    def summary(self) -> dict:
        return {
            "requests": self.requests,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "errors": self.errors,
            "duration_s": round(self.duration_s),
        }

session = _Session()
_health_cache = {}  # {"claude": {"available": True, "auth_ok": True}, ...}
_health_ts = 0      # 上次健康檢查時間


def _get_stub():
    global _channel, _stub
    if _stub is None:
        target = f"{PROXY_HOST}:{PROXY_PORT}"
        if PROXY_TLS:
            _channel = grpc.secure_channel(target, grpc.ssl_channel_credentials())
        else:
            _channel = grpc.insecure_channel(target)
        _stub = rpc.AIProxyStub(_channel)
    return _stub


def _auto_route(prompt: str) -> str:
    """分析 prompt 自動選擇模型等級（high/mid/fast）

    規則：
    - 長 prompt（>500字）或複雜關鍵字 → high
    - 短 prompt（<80字）且簡單關鍵字 → fast
    - 其他 → mid
    """
    length = len(prompt)

    # 複雜任務關鍵字（需要強模型）
    high_keywords = [
        "分析", "設計", "架構", "重構", "debug", "除錯", "比較",
        "optimize", "優化", "review", "審查", "explain why", "為什麼",
        "寫一篇", "write an essay", "implement", "實作",
        "complex", "複雜", "strategy", "策略", "plan", "規劃",
    ]

    # 簡單任務關鍵字（快速模型就夠）
    fast_keywords = [
        "翻譯", "translate", "你好", "hello", "hi", "是什麼",
        "what is", "define", "定義", "列出", "list",
        "yes or no", "true or false", "簡單", "simple",
        "一句話", "one line", "one word",
    ]

    prompt_lower = prompt.lower()

    # 長 prompt 或有複雜關鍵字 → high
    if length > 500 or any(k in prompt_lower for k in high_keywords):
        return "high"

    # 短 prompt 且有簡單關鍵字 → fast
    if length < 80 and any(k in prompt_lower for k in fast_keywords):
        return "fast"

    # 預設 → mid
    return "mid"


# 是否啟用自動路由（可在 .env 關閉）
AUTO_ROUTE = os.environ.get("AI_PROXY_AUTO_ROUTE", "true").lower() in ("true", "1", "yes")

# Quota Fallback Chain（客戶端降級：server 429/失敗時自動嘗試下一個 provider）
# 可在 .env 設定 AI_PROXY_FALLBACK_CHAIN=gemini,deepseek,groq 覆蓋
_DEFAULT_FALLBACK = {
    "claude":    ["gemini", "deepseek", "groq", "mistral", "xai", "together", "fireworks", "cohere", "openai"],
    "gemini":    ["claude", "deepseek", "groq", "mistral", "xai", "together", "fireworks", "cohere", "openai"],
    "openai":    ["deepseek", "groq", "mistral", "xai", "together", "fireworks", "cohere", "gemini", "claude"],
    "deepseek":  ["groq", "mistral", "xai", "together", "fireworks", "cohere", "gemini", "claude", "openai"],
    "mistral":   ["deepseek", "groq", "xai", "together", "fireworks", "cohere", "gemini", "claude", "openai"],
    "groq":      ["deepseek", "mistral", "xai", "together", "fireworks", "cohere", "gemini", "claude", "openai"],
    "xai":       ["deepseek", "groq", "mistral", "together", "fireworks", "cohere", "gemini", "claude", "openai"],
    "together":  ["deepseek", "groq", "mistral", "xai", "fireworks", "cohere", "gemini", "claude", "openai"],
    "fireworks": ["deepseek", "groq", "mistral", "xai", "together", "cohere", "gemini", "claude", "openai"],
    "cohere":    ["deepseek", "groq", "mistral", "xai", "together", "fireworks", "gemini", "claude", "openai"],
}
FALLBACK_ENABLED = os.environ.get("AI_PROXY_FALLBACK", "true").lower() in ("true", "1", "yes")

def _get_fallback_chain(provider: str) -> list[str]:
    """取得 provider 的 fallback chain"""
    custom = os.environ.get("AI_PROXY_FALLBACK_CHAIN", "")
    if custom:
        return [p.strip() for p in custom.split(",") if p.strip()]
    return _DEFAULT_FALLBACK.get(provider, [])


def _resolve_tier(provider: str, model: str, tier: str,
                  prompt: str = "") -> tuple[str, str]:
    """根據 tier 解析出 provider 和 model，支援 auto 路由"""
    if tier == "auto" or (not tier and not model and AUTO_ROUTE and prompt):
        tier = _auto_route(prompt)
    if tier:
        provider = provider or DEFAULT_PROVIDER
        tiers = MODEL_TIERS.get(provider, {})
        resolved = tiers.get(tier)
        if not resolved:
            available = ", ".join(tiers.keys()) if tiers else "無"
            raise ValueError(f"未知的 tier '{tier}'（{provider} 可用: {available}）")
        return provider, resolved
    provider = provider or DEFAULT_PROVIDER
    model = model or DEFAULT_MODELS.get(provider, "")
    return provider, model


# 敏感資訊偵測模式（canonical source: src/sensitive.py）
import re
_SENSITIVE_PATTERNS = [
    (re.compile(r'AIzaSy[A-Za-z0-9_-]{33}', re.IGNORECASE), "Google API Key"),
    (re.compile(r'sk-[A-Za-z0-9]{20,}', re.IGNORECASE), "OpenAI API Key"),
    (re.compile(r'sk-ant-[A-Za-z0-9-]{20,}', re.IGNORECASE), "Anthropic API Key"),
    (re.compile(r'ghp_[A-Za-z0-9]{36}', re.IGNORECASE), "GitHub Token"),
    (re.compile(r'gho_[A-Za-z0-9]{36}', re.IGNORECASE), "GitHub OAuth Token"),
    (re.compile(r'glpat-[A-Za-z0-9_-]{20,}', re.IGNORECASE), "GitLab Token"),
    (re.compile(r'xoxb-[0-9A-Za-z-]+', re.IGNORECASE), "Slack Bot Token"),
    (re.compile(r'xoxp-[0-9A-Za-z-]+', re.IGNORECASE), "Slack User Token"),
    (re.compile(r'(?:password|passwd|pwd)\s*[=:]\s*["\']?[^\s"\']{8,}', re.IGNORECASE), "密碼"),
    (re.compile(r'(?:secret|token|key)\s*[=:]\s*["\']?[A-Za-z0-9_-]{20,}', re.IGNORECASE), "Secret/Token"),
    (re.compile(r'AKIA[0-9A-Z]{16}', re.IGNORECASE), "AWS Access Key"),
    (re.compile(r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----', re.IGNORECASE), "私鑰"),
]

def _check_sensitive(prompt: str) -> str | None:
    """檢查 prompt 是否含有敏感資訊，有則回傳警告訊息"""
    found = [name for pat, name in _SENSITIVE_PATTERNS if pat.search(prompt)]
    return f"⚠ prompt 含有敏感資訊: {', '.join(found)}" if found else None

# 是否啟用敏感資料檢查（可在 .env 關閉）
SENSITIVE_CHECK = os.environ.get("AI_PROXY_SENSITIVE_CHECK", "true").lower() in ("true", "1", "yes")
# warn=警告但繼續, block=阻擋不送出
SENSITIVE_MODE = os.environ.get("AI_PROXY_SENSITIVE_MODE", "warn")


def _check_provider(provider: str):
    """預檢 provider 狀態，不可用時直接拋錯（快取 30 秒）"""
    import time
    global _health_cache, _health_ts
    now = time.time()
    if now - _health_ts > 30:
        try:
            h = health()
            _health_cache = h
            _health_ts = now
        except Exception:
            return  # 檢查失敗就跳過，不阻擋請求
    info = _health_cache.get(provider)
    if info and not info.get("available"):
        raise RuntimeError(
            f"{provider} 目前無法使用（授權已過期），請聯繫管理員上傳新憑證"
        )


def _encode_files(*file_args) -> list[dict]:
    """讀取檔案（圖片、PDF、音訊、影片）並轉為 base64"""
    import base64, mimetypes
    result = []
    paths = []
    for arg in file_args:
        if not arg:
            continue
        if isinstance(arg, str):
            paths.append(arg)
        elif isinstance(arg, (list, tuple)):
            paths.extend(arg)
    for path in paths:
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        result.append({"mime_type": mime, "data": data})
    return result


def _chat_rest(prompt, provider, model, system, max_tokens,
               project, group, images, timeout) -> dict:
    """走 REST API（多模態對話）"""
    import urllib.request, json
    url = f"{_get_dashboard_url()}/api/chat"
    body = json.dumps({
        "prompt": prompt, "provider": provider, "model": model,
        "system": system, "max_tokens": max_tokens,
        "project": project, "group": group, "images": images,
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {PROXY_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode()) if e.headers.get("content-type", "").startswith("application/json") else {}
        raise RuntimeError(err.get("error", f"請求失敗 ({e.code})"))


def ai(prompt: str, provider: str = None, model: str = None,
       tier: str = "", system: str = "", max_tokens: int = 4096,
       project: str = "", group: str = "", image: str = "",
       images: list[str] = None, file: str = "",
       files: list[str] = None, timeout: int = 90) -> str:
    """發送 AI 請求，回傳文字回應

    Args:
        prompt: 你的問題或指令
        provider: "claude" 或 "gemini"（預設 claude）
        model: 模型名稱，直接指定（如 "claude-opus-4-6"）
        tier: 模型等級 "high"/"mid"/"fast"，會自動對應模型（與 model 二選一）
        system: 可選的 system prompt
        max_tokens: 最大回應 token 數
        project: 專案名稱，可在 .env 設定 AI_PROXY_PROJECT 作為預設值
        group: 小組名稱，可在 .env 設定 AI_PROXY_GROUP 作為預設值
        image: 圖片檔案路徑（Claude + Gemini 都支援）
        images: 多張圖片檔案路徑列表
        file: 文件檔案路徑（PDF 等，Claude + Gemini 都支援）
        files: 多個文件檔案路徑列表
        timeout: 請求超時秒數（預設 90 秒）

    Returns:
        AI 的回應文字
    """
    # Server-side tier: 直接送 tier 給 server，不在本地解析
    if USE_SERVER_TIER and not model:
        server_tier = tier or ""
        provider = provider or DEFAULT_PROVIDER or ""
        project = project or DEFAULT_PROJECT
        group = group or DEFAULT_GROUP
    else:
        provider, model = _resolve_tier(provider, model, tier, prompt)
        server_tier = ""
        project = project or DEFAULT_PROJECT
        group = group or DEFAULT_GROUP
    _check_provider(provider)

    # 敏感資料檢查
    if SENSITIVE_CHECK:
        warning = _check_sensitive(prompt)
        if warning:
            if SENSITIVE_MODE == "block":
                raise RuntimeError(warning)
            import sys
            print(warning, file=sys.stderr)

    # 有附件時走 REST API（gRPC 不支援二進位）
    if image or images or file or files:
        if not model:
            _, model = _resolve_tier(provider, model, tier, prompt)
        encoded = _encode_files(image, images, file, files)
        data = _chat_rest(prompt, provider, model, system, max_tokens,
                          project, group, encoded, timeout)
        if not data.get("ok"):
            raise RuntimeError(data.get("error", "請求失敗"))
        session.track(data.get("input_tokens", 0), data.get("output_tokens", 0))
        return data["content"]

    # 純文字走 gRPC（含 Quota Fallback）
    stub = _get_stub()
    meta = [("authorization", f"Bearer {PROXY_TOKEN}")]

    def _grpc_call(prov, mdl):
        req_kwargs = dict(
            provider=prov, model=mdl, prompt=prompt,
            system=system, max_tokens=max_tokens,
            project=project, group=group,
        )
        # 新 proto 欄位（server-side tier）
        if server_tier:
            req_kwargs["tier"] = server_tier
        return stub.Complete(
            pb.CompletionRequest(**req_kwargs),
            metadata=meta, timeout=timeout,
        )

    resp = _grpc_call(provider, model)
    session.track(resp.input_tokens, resp.output_tokens)
    return resp.content


def ai_detail(prompt: str, provider: str = None, model: str = None,
              tier: str = "", system: str = "", max_tokens: int = 4096,
              project: str = "", group: str = "", image: str = "",
              images: list[str] = None, file: str = "",
              files: list[str] = None, timeout: int = 90) -> dict:
    """發送 AI 請求，回傳完整資訊（含 token 用量）

    Returns:
        {
            "content": "回應文字",
            "input_tokens": 10,
            "output_tokens": 150,
            "estimated": False,
            "latency_ms": 2500
        }
    """
    provider, model = _resolve_tier(provider, model, tier, prompt)
    project = project or DEFAULT_PROJECT
    group = group or DEFAULT_GROUP

    # 有附件時走 REST API
    if image or images or file or files:
        encoded = _encode_files(image, images, file, files)
        data = _chat_rest(prompt, provider, model, system, max_tokens,
                          project, group, encoded, timeout)
        if not data.get("ok"):
            raise RuntimeError(data.get("error", "請求失敗"))
        return {
            "content": data["content"],
            "input_tokens": data.get("input_tokens", 0),
            "output_tokens": data.get("output_tokens", 0),
            "estimated": False,
            "latency_ms": data.get("latency_ms", 0),
        }
    _check_provider(provider)
    stub = _get_stub()
    meta = [("authorization", f"Bearer {PROXY_TOKEN}")]

    def _grpc_call(prov, mdl):
        return stub.Complete(
            pb.CompletionRequest(
                provider=prov, model=mdl, prompt=prompt,
                system=system, max_tokens=max_tokens,
                project=project, group=group,
            ),
            metadata=meta, timeout=timeout,
        )

    def _to_dict(resp):
        return {
            "content": resp.content,
            "input_tokens": resp.input_tokens,
            "output_tokens": resp.output_tokens,
            "estimated": resp.tokens_estimated,
            "latency_ms": resp.latency_ms,
        }

    return _to_dict(_grpc_call(provider, model))


def ai_tools(prompt: str, tools: list[dict], provider: str = None,
             model: str = None, tier: str = "", system: str = "",
             max_tokens: int = 4096, project: str = "", group: str = "",
             timeout: int = 90) -> dict:
    """帶 Function Calling 的 AI 請求

    AI 會分析 prompt 並決定是否呼叫工具。回傳的 tool_calls 包含工具名稱和參數。

    Args:
        prompt: 你的問題或指令
        tools: 工具定義列表（格式取決於 provider）
            Claude: [{"name": "get_weather", "description": "...", "input_schema": {...}}]
            OpenAI: [{"type": "function", "function": {"name": "...", "parameters": {...}}}]
            Gemini: [{"functionDeclarations": [{"name": "...", "parameters": {...}}]}]
        provider: AI provider
        model: 模型名稱
        tier: 模型等級
        system: system prompt
        max_tokens: 最大回應 token 數
        project: 專案名稱
        group: 小組名稱
        timeout: 超時秒數

    Returns:
        {
            "content": "回應文字（可能為空，如果 AI 選擇呼叫工具）",
            "tool_calls": [{"id": "...", "name": "get_weather", "arguments": {"city": "台北"}}],
            "input_tokens": 10,
            "output_tokens": 50,
            "latency_ms": 1200,
        }
    """
    import urllib.request, json
    provider, model = _resolve_tier(provider, model, tier, prompt)
    project = project or DEFAULT_PROJECT
    group = group or DEFAULT_GROUP

    url = f"{_get_dashboard_url()}/api/chat/tools"
    body = json.dumps({
        "prompt": prompt, "provider": provider, "model": model,
        "system": system, "max_tokens": max_tokens,
        "project": project, "group": group, "tools": tools,
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {PROXY_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode()) if e.headers.get("content-type", "").startswith("application/json") else {}
        raise RuntimeError(err.get("error", f"請求失敗 ({e.code})"))

    if not data.get("ok"):
        raise RuntimeError(data.get("error", "Function calling 失敗"))

    session.track(data.get("input_tokens", 0), data.get("output_tokens", 0))
    return {
        "content": data.get("content", ""),
        "tool_calls": data.get("tool_calls", []),
        "input_tokens": data.get("input_tokens", 0),
        "output_tokens": data.get("output_tokens", 0),
        "latency_ms": data.get("latency_ms", 0),
    }


def ai_dual(prompt: str, providers: list[str] = None, system: str = "",
            max_tokens: int = 4096, project: str = "", group: str = "",
            timeout: int = 90) -> dict:
    """同時問多個 AI，回傳各自回答供比較決策

    用法:
        result = ai_dual("這段程式碼有安全問題嗎？")
        print("Claude:", result["claude"]["content"])
        print("Gemini:", result["gemini"]["content"])

        # 三個一起問
        result = ai_dual("分析架構", providers=["claude", "gemini", "openai"])
        print("OpenAI:", result["openai"]["content"])

    Returns:
        {"claude": {...}, "gemini": {...}, "openai": {...}}
    """
    import concurrent.futures
    providers = providers or ["claude", "gemini"]
    project = project or DEFAULT_PROJECT
    group = group or DEFAULT_GROUP

    def _ask(provider):
        try:
            _, model = _resolve_tier(provider, "", "mid", prompt)
            result = ai_detail(prompt, provider=provider, model=model,
                               system=system, max_tokens=max_tokens,
                               project=project, group=group, timeout=timeout)
            result["model"] = model
            result["provider"] = provider
            return result
        except Exception as e:
            return {"content": f"[{provider} 錯誤: {e}]", "model": "", "provider": provider,
                    "input_tokens": 0, "output_tokens": 0, "latency_ms": 0}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(providers)) as pool:
        futures = {provider: pool.submit(_ask, provider) for provider in providers}
        return {provider: future.result(timeout=timeout) for provider, future in futures.items()}


def ai_stream(prompt: str, provider: str = None, model: str = None,
              tier: str = "", system: str = "", max_tokens: int = 4096,
              project: str = "", group: str = "", timeout: int = 90):
    """串流 AI 請求，逐塊 yield 回應文字（真 SSE Streaming）

    用法:
        for chunk in ai_stream("寫一篇文章"):
            print(chunk, end="", flush=True)

    優先走 SSE（/api/chat/stream），失敗降級到 gRPC StreamComplete。
    """
    provider, model = _resolve_tier(provider, model, tier, prompt)
    project = project or DEFAULT_PROJECT
    group = group or DEFAULT_GROUP
    _check_provider(provider)

    # 嘗試 SSE streaming（真串流）
    try:
        yield from _stream_sse(prompt, provider, model, system, max_tokens,
                               project, group, timeout)
        return
    except Exception:
        pass  # SSE 失敗，降級到 gRPC

    # 降級到 gRPC StreamComplete（假串流）
    stub = _get_stub()
    meta = [("authorization", f"Bearer {PROXY_TOKEN}")]
    for chunk in stub.StreamComplete(
        pb.CompletionRequest(
            provider=provider, model=model, prompt=prompt,
            system=system, max_tokens=max_tokens,
            project=project, group=group,
        ),
        metadata=meta,
        timeout=timeout,
    ):
        if chunk.delta:
            yield chunk.delta


def _stream_sse(prompt, provider, model, system, max_tokens,
                project, group, timeout):
    """透過 SSE 串流取得回應"""
    import urllib.request, json
    url = f"{_get_dashboard_url()}/api/chat/stream"
    body = json.dumps({
        "prompt": prompt, "provider": provider, "model": model,
        "system": system, "max_tokens": max_tokens,
        "project": project, "group": group,
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {PROXY_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="ignore").strip()
            if not line.startswith("data: "):
                continue
            try:
                data = json.loads(line[6:])
            except json.JSONDecodeError:
                continue
            if data.get("done"):
                session.track(
                    data.get("input_tokens", 0),
                    data.get("output_tokens", 0),
                )
                break
            if data.get("error"):
                raise RuntimeError(data["error"])
            if "delta" in data:
                yield data["delta"]


def usage(days: int = 7, user: str = "", provider: str = "",
          project: str = "", group: str = "") -> dict:
    """查詢用量統計

    Args:
        days: 回顧天數（預設 7 天）
        user: 可選，按用戶篩選
        provider: 可選，按 provider 篩選
        project: 可選，按專案篩選
        group: 可選，按小組篩選

    Returns:
        {
            "total_requests": 42,
            "total_input_tokens": 5000,
            "total_output_tokens": 12000,
            "daily": [{"date": "2026-03-31", "requests": 10, ...}, ...]
        }
    """
    stub = _get_stub()
    meta = [("authorization", f"Bearer {PROXY_TOKEN}")]

    resp = stub.GetUsage(
        pb.UsageRequest(user=user, provider=provider, days=days,
                        project=project, group=group),
        metadata=meta,
    )
    return {
        "total_requests": resp.total_requests,
        "total_input_tokens": resp.total_input_tokens,
        "total_output_tokens": resp.total_output_tokens,
        "daily": [
            {"date": d.date, "requests": d.requests,
             "input_tokens": d.input_tokens, "output_tokens": d.output_tokens}
            for d in resp.daily
        ],
    }


# === 媒體生成（Gemini 專用，走 REST API）===

def _get_dashboard_url() -> str:
    """取得儀表板 REST API 的 URL"""
    host = PROXY_HOST
    # gRPC 和儀表板通常在同一台機器，儀表板 port 預設 8080（NAS 映射 8091）
    dashboard_port = os.environ.get("AI_PROXY_DASHBOARD_PORT", "8080")
    return f"http://{host}:{dashboard_port}"


def _generate(prompt: str, media_type: str, model: str = "",
              project: str = "", group: str = "",
              output: str = "", timeout: int = 120) -> dict:
    """呼叫 Gemini 媒體生成 API（內部函數）"""
    import urllib.request, json, base64
    project = project or DEFAULT_PROJECT
    group = group or DEFAULT_GROUP
    url = f"{_get_dashboard_url()}/api/generate"
    body = json.dumps({
        "prompt": prompt, "type": media_type, "model": model,
        "project": project, "group": group,
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {PROXY_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode()) if e.headers.get("content-type", "").startswith("application/json") else {}
        raise RuntimeError(err.get("error", f"生成失敗 ({e.code})"))

    if not data.get("ok"):
        raise RuntimeError(data.get("error", "生成失敗"))

    # 自動存檔
    if output and data.get("items"):
        item = data["items"][0]
        raw = base64.b64decode(item["data"])
        with open(output, "wb") as f:
            f.write(raw)

    return data


def ai_image(prompt: str, output: str = "output.png", model: str = "",
             project: str = "", group: str = "", timeout: int = 120) -> str:
    """生成圖片

    Args:
        prompt: 圖片描述
        output: 輸出檔案路徑（預設 output.png）
        model: 可選，模型名稱（預設 gemini-2.5-flash-image）
        project: 專案名稱
        group: 小組名稱
        timeout: 超時秒數

    Returns:
        輸出檔案路徑
    """
    _generate(prompt, "image", model=model, project=project,
              group=group, output=output, timeout=timeout)
    return output


def ai_video(prompt: str, output: str = "output.mp4", model: str = "",
             project: str = "", group: str = "", timeout: int = 300) -> str:
    """生成影片

    Args:
        prompt: 影片描述
        output: 輸出檔案路徑（預設 output.mp4）
        model: 可選，模型名稱（預設 veo-3.0-generate-001）
        timeout: 超時秒數（影片生成較慢，預設 300 秒）

    Returns:
        輸出檔案路徑
    """
    _generate(prompt, "video", model=model, project=project,
              group=group, output=output, timeout=timeout)
    return output


def ai_tts(text: str, output: str = "output.wav", model: str = "",
           project: str = "", group: str = "", timeout: int = 120) -> str:
    """文字轉語音

    Args:
        text: 要轉換的文字
        output: 輸出檔案路徑（預設 output.wav）
        model: 可選，模型名稱（預設 gemini-2.5-flash-preview-tts）

    Returns:
        輸出檔案路徑
    """
    _generate(text, "tts", model=model, project=project,
              group=group, output=output, timeout=timeout)
    return output


def ai_music(prompt: str, output: str = "output.wav", model: str = "",
             project: str = "", group: str = "", timeout: int = 300) -> str:
    """生成音樂

    Args:
        prompt: 音樂描述（風格、情緒、節奏等）
        output: 輸出檔案路徑（預設 output.wav）
        model: 可選，模型名稱（預設 lyria-3-clip-preview）

    Returns:
        輸出檔案路徑
    """
    _generate(prompt, "music", model=model, project=project,
              group=group, output=output, timeout=timeout)
    return output


def ai_embed(text: str, model: str = "gemini-embedding-001",
             timeout: int = 30) -> list[float]:
    """文字轉嵌入向量（Gemini 專用）

    Args:
        text: 要轉換的文字
        model: 嵌入模型（預設 gemini-embedding-001）
        timeout: 超時秒數

    Returns:
        浮點數向量列表（768 維）
    """
    import urllib.request, json
    url = f"{_get_dashboard_url()}/api/embed"
    body = json.dumps({"text": text, "model": model}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {PROXY_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode()) if e.headers.get("content-type", "").startswith("application/json") else {}
        raise RuntimeError(err.get("error", f"嵌入失敗 ({e.code})"))
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "嵌入失敗"))
    return data["embedding"]


# === 通知系統 ===

def notify(message: str, service: str = "", webhook_url: str = ""):
    """發送通知到 Telegram / Discord / Slack

    Args:
        message: 通知內容
        service: "telegram" / "discord" / "slack"（自動偵測 webhook URL）
        webhook_url: Webhook URL（也可在 .env 設定）

    .env 設定:
        AI_PROXY_NOTIFY_TELEGRAM=https://api.telegram.org/bot.../sendMessage?chat_id=...
        AI_PROXY_NOTIFY_DISCORD=https://discord.com/api/webhooks/...
        AI_PROXY_NOTIFY_SLACK=https://hooks.slack.com/services/...
    """
    import urllib.request, json

    # 從 .env 取 webhook URL
    if not webhook_url:
        urls = {
            "telegram": os.environ.get("AI_PROXY_NOTIFY_TELEGRAM", ""),
            "discord": os.environ.get("AI_PROXY_NOTIFY_DISCORD", ""),
            "slack": os.environ.get("AI_PROXY_NOTIFY_SLACK", ""),
        }
        if service:
            webhook_url = urls.get(service, "")
        else:
            # 自動找第一個有設定的
            for svc, url in urls.items():
                if url:
                    webhook_url = url
                    service = svc
                    break

    if not webhook_url:
        raise RuntimeError("未設定通知 webhook（在 .env 設定 AI_PROXY_NOTIFY_TELEGRAM/DISCORD/SLACK）")

    # 自動偵測 service
    if not service:
        if "telegram" in webhook_url:
            service = "telegram"
        elif "discord" in webhook_url:
            service = "discord"
        else:
            service = "slack"

    # 組合 payload
    if service == "telegram":
        body = json.dumps({"text": message}).encode()
    elif service == "discord":
        body = json.dumps({"content": message}).encode()
    else:  # slack
        body = json.dumps({"text": message}).encode()

    req = urllib.request.Request(webhook_url, data=body, method="POST",
                                headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        raise RuntimeError(f"通知發送失敗: {e}")


def notify_session(prefix: str = ""):
    """發送 session 用量摘要通知

    用法:
        # 長任務結束後
        notify_session("圖片批次生成完成")
    """
    s = session.summary()
    msg = f"{prefix}\n" if prefix else ""
    msg += f"請求: {s['requests']} 次 | Token: {s['total_tokens']:,} | 錯誤: {s['errors']} | 時間: {s['duration_s']}s"
    notify(msg)


def health() -> dict:
    """健康檢查（不需要 token）"""
    stub = _get_stub()
    resp = stub.HealthCheck(pb.Empty())
    return {
        "claude": {"available": resp.claude_available, "auth_ok": resp.claude_auth_ok, "idle": resp.claude_pool_idle},
        "gemini": {"available": resp.gemini_available, "auth_ok": resp.gemini_auth_ok, "idle": resp.gemini_pool_idle},
    }


# 直接執行測試
if __name__ == "__main__":
    print("=== 健康檢查 ===")
    h = health()
    for name, info in h.items():
        status = "✅" if info["available"] else "❌"
        print(f"  {name}: {status} (auth={info['auth_ok']}, idle={info['idle']})")

    print("\n=== Claude 測試 ===")
    result = ai_detail("用一句話說你好")
    print(f"  回應: {result['content']}")
    print(f"  Token: {result['input_tokens']} in / {result['output_tokens']} out")

    print("\n=== Gemini 測試 ===")
    result = ai_detail("用一句話說你好", provider="gemini")
    print(f"  回應: {result['content']}")
    print(f"  Token: {result['input_tokens']} in / {result['output_tokens']} out")

    print("\n=== 用量統計 ===")
    u = usage(days=7)
    print(f"  總請求: {u['total_requests']}")
    print(f"  總 Token: {u['total_input_tokens']} in / {u['total_output_tokens']} out")
