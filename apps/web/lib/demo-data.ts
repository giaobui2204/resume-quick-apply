import type { ResumeExtraction, WorkAuthorization } from "@quick-apply/shared";

export const emptyResume: ResumeExtraction = {
  schemaVersion: 1,
  contact: {
    legalName: "",
    preferredName: "",
    email: "",
    phone: "",
    location: "",
    linkedIn: "",
    github: "",
    portfolio: ""
  },
  summary: "",
  experiences: [],
  educations: [],
  projects: [],
  skills: [],
  certifications: [],
  warnings: []
};

export const emptyAuthorization: WorkAuthorization = {
  status: "undisclosed",
  authorizationStart: "",
  authorizationEnd: "",
  currentlyAuthorized: false,
  sponsorshipNow: false,
  sponsorshipFuture: false,
  confirmedAt: null
};
