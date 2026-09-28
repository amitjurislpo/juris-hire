import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "data");
const workspacePath = path.join(dataDirectory, "workspace.json");

const questionBank = [
  { id: "mcq-1", type: "mcq", category: "Sales aptitude", text: "A customer is unsure whether a product is right for them. What is your best first step?", options: ["Explain every feature", "Ask what they need the product to do", "Offer a discount immediately", "Move on to another customer"], correctIndex: 1, active: true },
  { id: "mcq-2", type: "mcq", category: "Sales aptitude", text: "A customer says the price is higher than expected. How should you respond?", options: ["Ask what they are comparing it with", "Tell them the price is final", "Change the subject", "Promise an unapproved discount"], correctIndex: 0, active: true },
  { id: "mcq-3", type: "mcq", category: "Reasoning", text: "Which detail is most useful before recommending a service?", options: ["The customer's actual goal", "The latest company slogan", "Your personal preference", "The longest feature list"], correctIndex: 0, active: true },
  { id: "mcq-4", type: "mcq", category: "Communication", text: "A customer misunderstands a key detail. What should you do?", options: ["Repeat it more loudly", "Clarify it in plain language and check understanding", "End the conversation", "Assume they will reread it"], correctIndex: 1, active: true },
  { id: "mcq-5", type: "mcq", category: "Sales aptitude", text: "A lead asks for information you do not know. What is the best response?", options: ["Make an educated guess", "Find a reliable answer and follow up", "Avoid answering", "Give an unrelated example"], correctIndex: 1, active: true },
  { id: "mcq-6", type: "mcq", category: "Reasoning", text: "Which follow-up is most helpful after a sales conversation?", options: ["A generic message every day", "A concise recap of relevant next steps", "A message with no context", "No follow-up under any circumstances"], correctIndex: 1, active: true },
  { id: "mcq-7", type: "mcq", category: "Communication", text: "What is the best way to handle a customer objection?", options: ["Listen, clarify the concern, then respond", "Talk over the objection", "Ignore it and continue the pitch", "Tell the customer they are wrong"], correctIndex: 0, active: true },
  { id: "mcq-8", type: "mcq", category: "Reasoning", text: "Two customers need help at once. What is a good approach?", options: ["Acknowledge both and set a clear order", "Help neither until they decide", "Choose based on who is louder", "Leave without explaining"], correctIndex: 0, active: true },
  { id: "written-1", type: "written", category: "Customer focus", text: "How would you discover what a new customer needs before recommending a product?", active: true },
  { id: "written-2", type: "written", category: "Communication", text: "Describe how you would respond to a customer who is unhappy with a service.", active: true },
  { id: "written-3", type: "written", category: "Reasoning", text: "Tell us about a time you learned something quickly. What helped you succeed?", active: true },
  { id: "written-4", type: "written", category: "Sales aptitude", text: "What makes a follow-up message useful rather than pushy?", active: true },
  { id: "written-5", type: "written", category: "Communication", text: "How would you explain a complex idea to someone new to the topic?", active: true },
  { id: "video-1", type: "video", category: "Introduction", text: "Introduce yourself and tell us what interests you about a customer-facing sales role.", active: true },
  { id: "video-2", type: "video", category: "Communication", text: "In 15 seconds, tell us how you build trust with someone new.", active: true },
];

const people = [
  ["JH-0248", "Aarav Mehta", "St. Xavier's College", "aarav.mehta@email.com", 86, "Shortlisted", 0, "photo-1500648767791-00dcc994a43e"],
  ["JH-0247", "Kiara Shah", "Mithibai College", "kiara.shah@email.com", 78, "HR Review", 1, "photo-1494790108377-be9c29b29330"],
  ["JH-0246", "Rohan Desai", "NM College", "rohan.desai@email.com", 91, "Interview", 0, "photo-1506794778202-cad84cf45f1d"],
  ["JH-0245", "Sara Fernandes", "Jai Hind College", "sara.fernandes@email.com", 72, "HR Review", 0, "photo-1534528741775-53994a69daeb"],
  ["JH-0244", "Dev Patel", "St. Xavier's College", "dev.patel@email.com", 64, "On Hold", 2, "photo-1504593811423-6dd665756598"],
  ["JH-0243", "Mira Iyer", "Sophia College", "mira.iyer@email.com", 88, "Shortlisted", 0, "photo-1544005313-94ddf0286df2"],
  ["JH-0242", "Kabir Nair", "NM College", "kabir.nair@email.com", 58, "Assessment Completed", 0, "photo-1507003211169-0a1dd7228f2d"],
  ["JH-0241", "Ananya Rao", "Mithibai College", "ananya.rao@email.com", 83, "Interview", 0, "photo-1531123897727-8f129e1688ce"],
];

function makeSeedWorkspace() {
  const activeQuestions = questionBank.filter((question) => question.active);
  return {
    drives: [{ id: "drive-sales-2526", name: "2025–26 Sales hiring", role: "Sales Associate", college: "Multiple colleges", date: "2025-02-24", status: "Active", createdAt: new Date().toISOString() }],
    questions: questionBank,
    candidates: people.map(([id, name, college, email, score, status, flags, image], index) => ({
      id, name, college, email, phone: "", score, status, flags, image,
      driveId: "drive-sales-2526", inviteToken: `sample-${id.toLowerCase()}`,
      questionIds: activeQuestions.filter((question) => question.type === "mcq").slice(0, 6).map((question) => question.id)
        .concat(activeQuestions.filter((question) => question.type === "written").slice(0, 3).map((question) => question.id))
        .concat(activeQuestions.filter((question) => question.type === "video").slice(0, 1).map((question) => question.id)),
      responses: {}, activityEvents: flags ? Array.from({ length: flags }, (_, eventIndex) => ({ type: "visibilitychange", at: new Date(Date.now() - (eventIndex + 1) * 3600000).toISOString() })) : [],
      videoRecorded: false, createdAt: new Date(Date.now() - index * 3600000).toISOString(),
    })),
  };
}

export async function getWorkspace() {
  try {
    return JSON.parse(await readFile(workspacePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const workspace = makeSeedWorkspace();
    await saveWorkspace(workspace);
    return workspace;
  }
}

export async function saveWorkspace(workspace) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${workspacePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(workspace, null, 2), "utf8");
  await rename(temporaryPath, workspacePath);
}

export function pickAssessmentQuestions(questions) {
  const choose = (type, count) => questions.filter((question) => question.type === type && question.active)
    .sort(() => Math.random() - 0.5).slice(0, count);
  return [...choose("mcq", 6), ...choose("written", 3), ...choose("video", 1)].sort(() => Math.random() - 0.5);
}