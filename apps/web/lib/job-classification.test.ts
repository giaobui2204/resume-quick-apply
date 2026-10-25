import { describe, expect, it } from "vitest";
import { classifyJob } from "./job-classification";

describe("evidence based job classification", () => {
  it.each([
    ["Software Engineer", "unknown"],
    ["Internal Tools Engineer", "unknown"],
    ["Software Engineer II", "unknown"],
    ["Graduate Research Scientist", "unknown"],
    ["Associate General Counsel", "unknown"],
    ["Junior / Senior Engineer", "unknown"],
    ["Software Engineer, New Grad", "entry"],
    ["Junior Developer", "entry"],
    ["Staff Software Engineer", "lead"],
    ["Senior Staff Engineer", "lead"],
    ["Engineering Manager", "management"],
    ["Intermediate Developer", "mid"],
    ["Research Intern", "intern"],
    ["Product Manager", "unknown"],
    ["Account Manager", "unknown"],
    ["Contract Manager", "unknown"],
    ["Senior Product Manager", "senior"],
    ["Staff Product Manager", "lead"],
    ["Manager, Engineering", "management"],
    ["People Manager", "management"]
  ])("classifies %s as %s", (title, level) => expect(classifyJob(title, "New York").experience).toBe(level));
  it("uses employer metadata without inferring onsite from a city", () => {
    expect(classifyJob("Engineer", "New York").workMode).toBe("unknown");
    expect(classifyJob("Engineer", "New York", "hybrid", "Full-time")).toMatchObject({
      workMode: "hybrid",
      employment: "full_time"
    });
    expect(classifyJob("Engineer", "Remote", "on-site").workMode).toBe("onsite");
    expect(classifyJob("Engineer", "Not remote").workMode).toBe("unknown");
    expect(classifyJob("Engineer", "Hybrid / Remote").workMode).toBe("unknown");
    expect(classifyJob("Remote Sensing Engineer", "London").workMode).toBe("unknown");
    expect(classifyJob("Engineer (Remote)", "").workMode).toBe("remote");
    expect(classifyJob("Contract Manager", "").employment).toBe("unknown");
    expect(classifyJob("Designer (Contract)", "").employment).toBe("contract");
  });
});
