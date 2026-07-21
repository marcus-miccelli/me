/**
 * Single source of truth for the about page CV and its appendices.
 *
 * Content mirrors the real CV at github/tex/marcus-miccelli cv.tex
 * (anonymised: no phone number), last synced against the Jul 2026 build.
 * Date ranges use en dashes. NO contact details in this module — the
 * social dock handles those, runtime-decoded (see lib/contact). The credly
 * profile is fine: it is a credential index, not a way to reach him.
 */

export type Marginalia = {
  title: string;
  body: string[];
};

export type Bullet = {
  id: string;
  /** Render text; **bold** spans become <b> on paper. */
  text: string;
  more?: Marginalia;
};

export type Entry = {
  id: string;
  kind: "role" | "project";
  heading: string;
  /** Right-aligned column: dates for roles, tech list for projects. */
  right: string;
  sub?: string;
  place?: string;
  bullets: Bullet[];
};

export type Section = {
  id: string;
  title: string;
  entries: Entry[];
};

export const NAME = "Marcus Miccelli";

/** Both lines verbatim from the tex source's (commented) tagline block. */
export const TAGLINE =
  "Driven by problem-solving, people, art, and continuous learning.";
export const SEEKING =
  "Seeking to challenge myself in the field of Quantitative Trading.";

export const PDF_PATH = "/marcus-miccelli-cv.pdf";
export const PDF_NAME = "marcus-miccelli-cv.pdf";

export const SECTIONS: Section[] = [
  {
    id: "edu",
    title: "Education",
    entries: [
      {
        id: "edu-monash",
        kind: "role",
        heading: "Monash University",
        right: "Feb 2023 – Dec 2026",
        sub: "Bachelor of Computer Science (Advanced), Major in Mathematics",
        place: "Clayton, VIC",
        bullets: [
          {
            id: "edu-monash-wam",
            text: "Weighted Average Mark: 81.29%; GPA: 3.50.",
          },
          {
            id: "edu-monash-units",
            text: "Completed coursework: Advanced DSA (90), Programming Paradigms (89), Databases (86), Linear Algebra (81).",
            more: {
              title: "What actually stuck",
              body: [
                "Advanced DSA rewired how I estimate cost before writing a line — the 90 came from treating every assignment as a proof first, code second.",
                "Programming Paradigms was the sleeper hit: a semester of functional thinking that quietly improved every imperative program I've written since.",
              ],
            },
          },
          {
            id: "edu-monash-future",
            text: "Future coursework: Time Series & Stochastic Processes, Financial Mathematics.",
            more: {
              title: "The quant trajectory",
              body: [
                "The maths major is pointed somewhere: Time Series, Stochastic Processes and Financial Mathematics are the formal backbone for quantitative trading — where I want to test myself next.",
              ],
            },
          },
          {
            id: "edu-monash-award",
            text: "Award of Excellence in Object-Oriented Design and Implementation (90).",
          },
        ],
      },
      {
        id: "edu-accm",
        kind: "role",
        heading: "Australian College of Commerce and Management",
        right: "May 2021 – Aug 2022",
        sub: "Certificate IV in Information Technology (Networking)",
        place: "Melbourne, VIC",
        bullets: [
          {
            id: "edu-accm-recognition",
            text: "Recognition of academic performance in Virtualisation, Configuring Internet Protocols, and Network Security.",
          },
        ],
      },
      {
        id: "edu-msft",
        kind: "role",
        heading: "Microsoft Traineeship Program",
        right: "May 2021 – Aug 2022",
        sub: "Completed alongside Certificate IV",
        place: "Melbourne, VIC",
        bullets: [
          {
            id: "edu-msft-certs",
            text: "Certified in **Azure Fundamentals**, **MTA Windows Server Administration**, **Networking**, **Security**. See more: [credly.com/marcus-miccelli](https://www.credly.com/users/marcus-miccelli/)",
          },
        ],
      },
    ],
  },
  {
    id: "exp",
    title: "Experience",
    entries: [
      {
        id: "exp-jetstar",
        kind: "role",
        heading: "Backend Developer (Intern)",
        right: "Jan 2025 – Jun 2025",
        sub: "Jetstar",
        place: "Melbourne, VIC",
        bullets: [
          {
            id: "exp-jetstar-sonar",
            text: "Built a fault-tolerant, idempotent **SonarQube**→**Jira** proof of concept in **Python** on raw **REST APIs**, routing a 3,000-issue code-quality backlog onto the squad boards developers already work from.",
            more: {
              title: "How the pipeline worked",
              body: [
                "A Python service pulled SonarQube findings over REST, fingerprinted each one, and reconciled against existing Jira issues before filing — so re-runs, retries and overlapping scans could never double-ticket. Idempotency was the whole game.",
                "Owning it end to end (design, auth, failure modes, getting 3,000 findings onto boards people actually read) taught me more about production software than any subject had.",
              ],
            },
          },
          {
            id: "exp-jetstar-veracode",
            text: "Remediated **Veracode** static-analysis findings in production **C#** services, resolving insecure cryptographic functions and unsanitised input handling against **OWASP Top 10** patterns, having picked up the language during placement.",
            more: {
              title: "Learning C# on the job",
              body: [
                "Handed a language I hadn't written before and a queue of static-analysis findings in production services — insecure crypto calls, unsanitised input. The fix is rarely the hard part; understanding why the pattern was flagged is.",
                "Reading OWASP Top 10 alongside a real codebase beat any tutorial: the vulnerabilities stop being abstract once they're sitting in a file you have to change.",
              ],
            },
          },
          {
            id: "exp-jetstar-fullstack",
            text: "Delivered full-stack contributions: **JavaScript** frontend fixes for booking flows, and automation scripts (**GitHub API**) for data extraction and housekeeping.",
            more: {
              title: "Shipping in a legacy codebase",
              body: [
                "Fixes in customer-facing booking flows, where the hard part is never the fix — it's proving the fix touches nothing else.",
                "The automation side (GitHub API housekeeping) was my first taste of writing code whose user is the team itself.",
              ],
            },
          },
        ],
      },
      {
        id: "exp-natit",
        kind: "role",
        heading: "IT Technician",
        right: "May 2021 – Dec 2022",
        sub: "National IT Solutions",
        place: "Melbourne, VIC",
        bullets: [
          {
            id: "exp-natit-m365",
            text: "Administered **Microsoft 365** and **Azure AD/Entra ID** tenants for 50+ clients: user lifecycle and licensing, security groups, **Exchange Online** mailboxes, and **SharePoint** site provisioning and permissions.",
          },
          {
            id: "exp-natit-intune",
            text: "Standardised device onboarding in **Intune**, using hybrid Azure AD join for domain-bound Windows machines via **Azure AD Connect** and supervised iPad enrolment through **Apple Business Manager**, with compliance policies and app deployment.",
          },
          {
            id: "exp-natit-onprem",
            text: "Maintained on-premises **Windows Server** estates behind the hybrid tenants: **Active Directory** objects and OU delegation, **Group Policy** for security baselines and drive mappings, and domain controller, **DNS**, and **DHCP** upkeep across client sites; mentored trainees.",
          },
          {
            id: "exp-natit-licensing",
            text: "Optimised client licensing using **PowerShell** and **Excel**, delivering cost-saving recommendations to CTO and CEO.",
            more: {
              title: "The MSP years",
              body: [
                "MSP support is triage under pressure: unfamiliar stack, unhappy client, clock running. It made me fast at isolating faults and honest about what I don't know yet.",
                "The licensing audit started as a spreadsheet chore and ended as a PowerShell report with cost-saving recommendations presented to the CTO and CEO — the first time I turned grunt work into leverage.",
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "proj",
    title: "Selected Projects",
    entries: [
      {
        id: "proj-oss",
        kind: "project",
        heading: "Open Source Contributions",
        right: "Java, Shell",
        bullets: [
          {
            id: "proj-oss-mineplex",
            text: "Diagnosed and fixed crashes and bugs for Mineplex, a 240,000-line **Java** Minecraft server codebase, and reduced cognitive complexity flagged by **SonarQube**. Also hardened the bootstrap installer of Dark Islands, a **VS Code** theme, with stronger error handling and temp-directory management.",
            more: {
              title: "240,000 lines of other people's Java",
              body: [
                "Mineplex crashes rarely came with clean repro steps — mostly stack traces and guesswork. Fixing them meant learning to navigate a codebase far too big to read, which is most codebases.",
                "The cognitive-complexity work was the same skill inverted: rewriting code so the next stranger doesn't need the guesswork.",
              ],
            },
          },
        ],
      },
      {
        id: "proj-lobby",
        kind: "project",
        heading: "Lobby",
        right: "Svelte, TypeScript, Supabase",
        bullets: [
          {
            id: "proj-lobby-macathon",
            text: "Placed 3rd at MACATHON 2026 with a mobile-first platform for apartment residents to anonymously raise and upvote building issues; enforced resident/manager authorisation at the database layer with **Postgres** row-level security on **Supabase** Auth and Realtime.",
            more: {
              title: "72 hours to third place",
              body: [
                "The part that impressed judges: authorisation lives in the database, not the app. Postgres row-level security means a resident physically cannot query another building's issues, even through a broken client.",
                "MACATHON also taught brutal scoping — everything that didn't serve the demo got cut by hour 12.",
              ],
            },
          },
        ],
      },
      {
        id: "proj-quicknote",
        kind: "project",
        heading: "QuickNote (WIP)",
        right: "C, Win32, Claude Code",
        bullets: [
          {
            id: "proj-quicknote-main",
            text: "Building a performance-first native Windows sticky-note app in **C** on raw **Win32**/**RichEdit** with live Markdown rendering to master agentic development with **Claude Code**.",
            more: {
              title: "Why C and Win32 in 2026",
              body: [
                "A sticky-note app is a solved problem, which makes it the perfect vehicle: raw Win32 and RichEdit with zero framework between me and the platform, keeping startup and input latency near-invisible.",
                "It doubles as a lab for agentic development — learning where Claude Code accelerates systems work and where it needs a short leash.",
              ],
            },
          },
        ],
      },
      {
        id: "proj-portfolio",
        kind: "project",
        heading: "Portfolio (WIP)",
        right: "React, TypeScript, React Three Fiber",
        bullets: [
          {
            id: "proj-portfolio-main",
            text: "Developing an interactive 3D portfolio site as a deliberate ramp into graphics programming: **React Three Fiber** scenes with **GSAP** scroll-driven animation and hand-written **GLSL** shaders.",
            more: {
              title: "This site",
              body: [
                "The orb on the main menu is React Three Fiber with hand-written GLSL — the whole site is a deliberate ramp into graphics programming, one shader at a time.",
                "Even this page is part of it: the CV you're reading and the appendices it cites render from the same data file.",
              ],
            },
          },
        ],
      },
    ],
  },
];
