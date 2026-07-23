export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { stockList } = await request.json();

      // 1. 呼叫 Gemini API
      const geminiPrompt = `請用精簡扼要的口吻分析以下股票庫存資料，提供專業短評與建議：\n${JSON.stringify(stockList)}`;
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: geminiPrompt }] }]
        })
      });
      
      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) throw new Error(`Gemini API 錯誤: ${JSON.stringify(geminiData)}`);
      
      const analysisText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "無法取得分析結果";

      // 2. 呼叫 OpenAI API (TTS)
      const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "tts-1",
          input: analysisText,
          voice: "alloy"
        })
      });

      if (!openaiRes.ok) {
        const errorDetail = await openaiRes.text();
        throw new Error(`OpenAI TTS 失敗 (${openaiRes.status}): ${errorDetail}`);
      }

      const audioBuffer = await openaiRes.arrayBuffer();

      // 3. 用 Multipart 或自訂 Headers 把「分析文字」與「二進位音檔」一起安全回傳
      return new Response(audioBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Analysis-Text": encodeURIComponent(analysisText), // 把文字放在 Header 避免中文亂碼
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "X-Analysis-Text"   // 允許前端讀取這個 Header
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
