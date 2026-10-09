"use server";

import {
  submitCandidateAnswer as fileCandidateAnswer,
  submitConstituentQuestion as fileConstituentQuestion,
} from "@/app/lib/actions/qa";

export async function submitConstituentQuestion(debateId: string, content: string) {
  return fileConstituentQuestion(debateId, content);
}

export async function submitCandidateAnswer(questionId: string, content: string) {
  return fileCandidateAnswer(questionId, content);
}
