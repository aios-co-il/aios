import type { MetaLeadQuestion } from "../tool-contracts-marketing.ts";
import { readMetaLeadQuestionInput } from "../tool-contracts-marketing.ts";

/** Retains question limits and validation before any Meta read or write. */
export function normalizeMetaLeadQuestions(value: unknown) {
  const questions: Array<unknown> = Array.isArray(value)
    ? value.slice(0, 30)
    : [];
  if (questions.length === 0) {
    throw new Error("יש להגדיר לפחות שדה אחד בטופס");
  }
  const allowedQuestionTypes = new Set([
    "FULL_NAME",
    "FIRST_NAME",
    "LAST_NAME",
    "EMAIL",
    "PHONE",
    "CITY",
    "STATE",
    "ZIP",
    "COUNTRY",
    "STREET_ADDRESS",
    "DATE_OF_BIRTH",
    "GENDER",
    "MARITAL_STATUS",
    "RELATIONSHIP_STATUS",
    "MILITARY_STATUS",
    "JOB_TITLE",
    "WORK_PHONE_NUMBER",
    "WORK_EMAIL",
    "COMPANY_NAME",
    "CUSTOM",
  ]);
  return questions.map((input): MetaLeadQuestion => {
    const question = readMetaLeadQuestionInput(input);
    const type = (question.type || "").trim().toUpperCase();
    if (!allowedQuestionTypes.has(type)) {
      throw new Error(`סוג שדה Meta אינו נתמך: ${type || "ריק"}`);
    }
    if (type === "CUSTOM" && !(question.label || "").trim()) {
      throw new Error("שדה CUSTOM חייב לכלול label");
    }
    return question.label ? { type, label: question.label.trim() } : { type };
  });
}
