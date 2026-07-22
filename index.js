export default {
  async fetch(request, env, ctx) {
    // 處理 CORS（跨域請求），允許你的 GitHub Pages 網域存取
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*", // 正式上線建議改為你的 GitHub Pages 網址，例如 "https://yourname.github.io"
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

      // 1. 呼叫 Gemini API 進行股票分析
      const geminiPrompt = `請分析以下股票庫存資料，提供專業的短評、風險與建議：\n${JSON.stringify(stockList)}`;
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: geminiPrompt }] }]
        })
      });
      const geminiData = await geminiRes.json();
      const analysisText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "無法取得分析結果";

      // 2. 呼叫 OpenAI API (TTS 語音模組) 將分析文字轉成語音
      const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "tts-1",
          input: analysisText,
          voice: "alloy" // 可選: alloy, echo, fable, onyx, nova, shimmer
        })
      });

      if (!openaiRes.ok) {
        throw new Error("OpenAI TTS 產生失敗");
      }

      // 將 OpenAI 的語音音檔 (mp3) 與分析文字一起回傳給前端
      const audioBuffer = await openaiRes.arrayBuffer();

      return new Response(JSON.stringify({
        analysis: analysisText,
        audio: btoa(String.fromCharCode(...new Uint8Array(audioBuffer))) // 轉成 Base64 傳給前端
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
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