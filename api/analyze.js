export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mime } = req.body || {};

    if (!image || !mime) {
      return res.status(400).json({ error: '缺少圖片資料' });
    }

    if (image.length > 7000000) {
      return res.status(400).json({ error: '圖片過大，請使用較小的照片' });
    }

    const PROMPT = `你是專精於血液透析患者飲食管理的腎臟科營養師。請分析這張餐點照片的磷含量風險。

嚴格以下列JSON格式回應，不要包含任何markdown或其他文字：

{
  "overallRisk": "high | medium | low 三者之一",
  "riskTitle": "10字內中文風險標題",
  "riskSummary": "30字內整體摘要",
  "estimatedPhosphorus": 估算總磷量數字（整數mg）,
  "foods": [
    {
      "name": "食物名稱",
      "risk": "high | medium | low",
      "phosphorus": 每份磷含量數字（整數mg）,
      "portion": "份量描述"
    }
  ],
  "advice": "針對此餐點給透析患者的具體建議（80字內）",
  "alternatives": [
    { "original": "高磷食物", "replace": "替代選項", "reason": "15字內原因" }
  ],
  "drugReminder": true或false（含中高磷食物時為true）
}

磷含量參考：
高磷食物（>200mg/100g）：動物內臟、加工肉品、全穀類、豆類、堅果、乳製品、可樂、啤酒、速食、泡麵、火鍋料、加工食品
中磷食物（100-200mg）：肉類、魚類、蛋、白米飯、麵條
低磷食物（<100mg）：川燙蔬菜、白吐司、冬粉、米粉、水果

若有加工食品，應特別警示其含磷添加物。`;

    const models = [
      'openrouter/free',
      'qwen/qwen2.5-vl-72b-instruct:free',
      'qwen/qwen2.5-vl-32b-instruct:free',
      'meta-llama/llama-3.2-11b-vision-instruct:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'moonshotai/kimi-vl-a3b-thinking:free'
    ];

    const dataUrl = `data:${mime};base64,${image}`;
    let lastError = null;

    for (const model of models) {
      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }],
            temperature: 0.3,
            max_tokens: 1500
          })
        });

        if (!aiRes.ok) {
          lastError = `${model}: HTTP ${aiRes.status}`;
          continue;
        }

        const aiData = await aiRes.json();

        if (aiData.error) {
          lastError = `${model}: ${aiData.error.message}`;
          continue;
        }

        const text = aiData.choices?.[0]?.message?.content;
        if (!text) {
          lastError = `${model}: 無回傳內容`;
          continue;
        }

        return res.status(200).json({ result: text, model });

      } catch (e) {
        lastError = `${model}: ${e.message}`;
        continue;
      }
    }

    return res.status(503).json({
      error: '所有 AI 模型暫時都無法使用',
      detail: lastError
    });

  } catch (e) {
    return res.status(500).json({ error: e.message || '伺服器錯誤' });
  }
}
