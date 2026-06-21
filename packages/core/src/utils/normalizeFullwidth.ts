/**
 * 全角字符→半角字符替换函数
 *
 * 跳过字符串字面量（", '）内部的内容，避免污染语义。
 * 跳过 @{...} ID 引用中的 @ { } 符号，因为这些不是全角字符。
 *
 * 处理范围：
 * - 全角标点：括号、冒号、逗号、句号、问号、感叹号等
 * - 全角数字：０１２３４５６７８９
 * - 全角字母：ＡＢＣ...ｚ（含大小写）
 * - 全角空格
 */

/**
 * 建立全角→半角字符映射表。
 * 使用 Map 而非 replace 链：一次性遍历文本，O(n) 复杂度。
 */
const FW_MAP = new Map<string, string>();

// 全角空格
FW_MAP.set('\u3000', ' '); // 　→ (空格)

// 全角括号
FW_MAP.set('\uFF08', '('); // （  → (
FW_MAP.set('\uFF09', ')'); // ）  → )
FW_MAP.set('\uFF3B', '['); // ［  → [
FW_MAP.set('\uFF3D', ']'); // ］  → ]
FW_MAP.set('\u3010', '['); // 【  → [
FW_MAP.set('\u3011', ']'); // 】  → ]
FW_MAP.set('\uFF5B', '{'); // ｛  → {
FW_MAP.set('\uFF5D', '}'); // ｝  → }

// 全角标点
FW_MAP.set('\uFF1A', ':'); // ：  → :
FW_MAP.set('\uFF1B', ';'); // ；  → ;
FW_MAP.set('\uFF0C', ','); // ，  → ,
FW_MAP.set('\u3001', ','); // 、  → ,
FW_MAP.set('\uFF0E', '.'); // ．  → .
FW_MAP.set('\u3002', '.'); // 。  → .
FW_MAP.set('\uFF01', '!'); // ！  → !
FW_MAP.set('\uFF1F', '?'); // ？  → ?
FW_MAP.set('\uFF20', '@'); // ＠  → @
FW_MAP.set('\uFF03', '#'); // ＃  → #
FW_MAP.set('\uFF04', '$'); // ＄  → $
FW_MAP.set('\uFF05', '%'); // ％  → %
FW_MAP.set('\uFF06', '&'); // ＆  → &
FW_MAP.set('\uFF0A', '*'); // ＊  → *
FW_MAP.set('\uFF0B', '+'); // ＋  → +
FW_MAP.set('\uFF0D', '-'); // －  → -
FW_MAP.set('\uFF0F', '/'); // ／  → /
FW_MAP.set('\u00D7', '*'); // ×  → *
FW_MAP.set('\u00F7', '/'); // ÷  → /
FW_MAP.set('\uFF1D', '='); // ＝  → =
FW_MAP.set('\uFF1C', '<'); // ＜  → <
FW_MAP.set('\uFF1E', '>'); // ＞  → >
FW_MAP.set('\uFF3E', '^'); // ＾  → ^
FW_MAP.set('\uFF5C', '|'); // ｜  → |
FW_MAP.set('\uFFE3', '~'); // ￣  → ~
FW_MAP.set('\uFF3F', '_'); // ＿  → _
FW_MAP.set('\uFF40', '`'); // ｀  → `

// 全角数字 ０-９
for (let i = 0; i <= 9; i++) {
  FW_MAP.set(String.fromCharCode(0xFF10 + i), String.fromCharCode(0x30 + i));
}

// 全角大写字母 Ａ-Ｚ
for (let i = 0; i < 26; i++) {
  FW_MAP.set(String.fromCharCode(0xFF21 + i), String.fromCharCode(0x41 + i));
}

// 全角小写字母 ａ-ｚ
for (let i = 0; i < 26; i++) {
  FW_MAP.set(String.fromCharCode(0xFF41 + i), String.fromCharCode(0x61 + i));
}

/**
 * 将文本中的全角字符替换为对应的半角字符。
 * 跳过双引号 (") 和单引号 (') 包围的字符串字面量内部，避免污染语义。
 */
export function normalizeFullwidth(text: string): string {
  if (!text) return text;

  let result = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // 处理转义引号 \' 或 \"
    if ((char === '"' || char === "'") && i > 0 && text[i - 1] === '\\') {
      result += char;
      continue;
    }

    // 处理非转义的双引号
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      continue;
    }

    // 处理非转义的单引号
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += char;
      continue;
    }

    // 在字符串字面量内部，不做替换
    if (inDoubleQuote || inSingleQuote) {
      result += char;
      continue;
    }

    // 执行全角→半角替换
    const replacement = FW_MAP.get(char);
    result += replacement !== undefined ? replacement : char;
  }

  return result;
}
