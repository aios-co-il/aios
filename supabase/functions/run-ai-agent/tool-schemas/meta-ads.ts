export const metaAdsTools = [
  // ===========================
  // META (Facebook + Instagram) ADS — all mutating actions go through approval queue
  // ===========================
  {
    name: "fb_create_campaign",
    description:
      "יצירת קמפיין חדש בפייסבוק/אינסטגרם. **דורש אישור בוואטסאפ** — הכלי יוצר בקשת אישור ומחכה. סטטוס ברירת מחדל PAUSED. השתמש objective: OUTCOME_LEADS / OUTCOME_TRAFFIC / OUTCOME_SALES.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
        daily_budget: { type: "number", description: 'בש"ח (לא מינור-יוניטס)' },
        special_ad_categories: { type: "array", items: { type: "string" } },
      },
      required: ["client_id", "name"],
    },
  },
  {
    name: "fb_create_adset",
    description: "יצירת ad set חדש (קהל יעד + תקציב). דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        name: { type: "string" },
        daily_budget: { type: "number" },
        billing_event: { type: "string" },
        optimization_goal: { type: "string" },
        targeting: {
          type: "object",
          description: "מבנה Meta targeting (geo, age, interests)",
        },
        start_time: { type: "string" },
        end_time: { type: "string" },
      },
      required: ["campaign_id", "name", "targeting"],
    },
  },
  {
    name: "fb_create_creative_from_media",
    description:
      "בניית קריאייטיב חדש מתוך media_id בספריה + page_id + טקסט. דורש אישור. אם lead_form_id מצורף — הקריאייטיב יוצר/מקושר ל-Lead Gen Form.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        media_id: { type: "string" },
        page_id: { type: "string" },
        message: { type: "string" },
        link: { type: "string" },
        name: { type: "string" },
        call_to_action_type: { type: "string" },
        lead_form_id: { type: "string" },
      },
      required: ["client_id", "media_id", "page_id", "message"],
    },
  },
  {
    name: "fb_create_ad",
    description:
      "יצירת מודעה (ad) ב-ad set קיים עם קריאייטיב מוכן. דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        adset_id: { type: "string" },
        name: { type: "string" },
        creative_id: { type: "string" },
      },
      required: ["adset_id", "name", "creative_id"],
    },
  },
  {
    name: "fb_replace_lead_form",
    description: "החלפת טופס לידים במודעה קיימת. דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        ad_id: { type: "string" },
        new_form_id: { type: "string" },
      },
      required: ["ad_id", "new_form_id"],
    },
  },
  {
    name: "fb_update_budget",
    description: "שינוי תקציב יומי או lifetime לקמפיין/ad set. דורש אישור.",
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "campaign_id או adset_id" },
        daily_budget: { type: "number" },
        lifetime_budget: { type: "number" },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "fb_pause",
    description: "השהיית קמפיין/ad set/מודעה (PAUSED). דורש אישור.",
    parameters: {
      type: "object",
      properties: { entity_id: { type: "string" } },
      required: ["entity_id"],
    },
  },
  {
    name: "fb_resume",
    description: "הדלקה מחדש (ACTIVE) של קמפיין/ad set/מודעה. דורש אישור.",
    parameters: {
      type: "object",
      properties: { entity_id: { type: "string" } },
      required: ["entity_id"],
    },
  },
];
