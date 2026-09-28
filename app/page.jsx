"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownRight, ArrowRight, Bell, BriefcaseBusiness, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileQuestion, LayoutDashboard, MoreHorizontal, Search, Settings2, SlidersHorizontal, Sparkles, Video, X } from "lucide-react";

const initialCandidates = [
  { id: "JH-0248", name: "Aarav Mehta", college: "St. Xavier's College", email: "aarav.mehta@email.com", score: 86, status: "Shortlisted", date: "Today, 10:42 AM", flags: 0, image: "photo-1500648767791-00dcc994a43e", answers: ["I enjoy understanding what a customer actually needs before recommending a solution.", "A good salesperson listens first, then makes the decision feel easy."], note: "Clear, customer-first answers. Strong communication in video response." },
  { id: "JH-0247", name: "Kiara Shah", college: "Mithibai College", email: "kiara.shah@email.com", score: 78, status: "HR Review", date: "Today, 9:18 AM", flags: 1, image: "photo-1494790108377-be9c29b29330", answers: ["I would ask a few questions to understand the customer's priorities.", "I stay calm, listen to the concern, and offer a practical next step."], note: "Thoughtful written responses. One visibility event logged at 09:02 AM." },
  { id: "JH-0246", name: "Rohan Desai", college: "NM College", email: "rohan.desai@email.com", score: 91, status: "Interview", date: "Yesterday, 4:36 PM", flags: 0, image: "photo-1506794778202-cad84cf45f1d", answers: ["I would connect the product benefits to the problem the customer described.", "Follow up with relevant information, without being pushy."], note: "Top assessment score. Confident and concise video response." },
  { id: "JH-0245", name: "Sara Fernandes", college: "Jai Hind College", email: "sara.fernandes@email.com", score: 72, status: "HR Review", date: "Yesterday, 3:12 PM", flags: 0, image: "photo-1534528741775-53994a69daeb", answers: ["I would listen carefully and clarify what they are looking for.", "I would explain how the product can help with their specific situation."], note: "Good reasoning; written responses could use more detail." },
  { id: "JH-0244", name: "Dev Patel", college: "St. Xavier's College", email: "dev.patel@email.com", score: 64, status: "On Hold", date: "Yesterday, 1:54 PM", flags: 2, image: "photo-1504593811423-6dd665756598", answers: ["I would try to find the best offer for them.", "I would ask my manager if I was not sure."], note: "Two visibility events recorded. Review activity log before next step." },
  { id: "JH-0243", name: "Mira Iyer", college: "Sophia College", email: "mira.iyer@email.com", score: 88, status: "Shortlisted", date: "Yesterday, 11:27 AM", flags: 0, image: "photo-1544005313-94ddf0286df2", answers: ["I like learning about people and matching them with the right solution.", "I would follow up with a short recap and answer any open questions."], note: "Strong examples and an engaging video introduction." },
  { id: "JH-0242", name: "Kabir Nair", college: "NM College", email: "kabir.nair@email.com", score: 58, status: "Assessment Completed", date: "Mon, 2:48 PM", flags: 0, image: "photo-1507003211169-0a1dd7228f2d", answers: ["I would explain the features and ask if they need help.", "I would make sure the customer is happy with the result."], note: "Assessment completed. Awaiting first HR review." },
  { id: "JH-0241", name: "Ananya Rao", college: "Mithibai College", email: "ananya.rao@email.com", score: 83, status: "Interview", date: "Mon, 11:05 AM", flags: 0, image: "photo-1531123897727-8f129e1688ce", answers: ["I would find out what matters most to them and build from there.", "I see feedback as useful; I would thank them and work on it."], note: "Strong assessment with a considered video response." },
];

const statuses = ["Assessment Completed", "HR Review", "Shortlisted", "Interview", "Selected", "Rejected", "On Hold"];
const avatarUrl = (image) => `https://images.unsplash.com/${image}?auto=format&fit=crop&w=96&h=96&q=80`;
const statusClass = (status) => status.toLowerCase().replaceAll(" ", "-");

function Avatar({ candidate, large = false }) {
  return <img className={`avatar ${large ? "avatar-large" : ""}`} src={avatarUrl(candidate.image)} alt="" />;
}

import HRWorkspace from "./components/hr-workspace";

export default function HomePage() {
  return <HRWorkspace />;
}