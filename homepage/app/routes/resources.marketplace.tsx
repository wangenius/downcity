/**
 * Agent Marketplace 公开页面。
 * 说明：
 * 1. 展示所有已经审核通过的社区 Agent。
 * 2. 提供公开提交流程，提交后先进入 Supabase 审核队列。
 */
import { AlertCircle, ArrowUpRight, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  data,
  Form,
  redirect,
  useActionData,
  useLocation,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/resources.marketplace";
import { marketingTheme } from "@/lib/marketing-theme";
import {
  findAgentMarketplaceSubmissionByNormalizedRepositoryUrl,
  listApprovedAgentMarketplaceSubmissions,
  createAgentMarketplaceSubmission,
} from "@/services/agent-marketplace/repository";
import {
  normalizeRepositoryUrl,
  normalizeTextInput,
} from "@/services/agent-marketplace/normalization";
import type {
  AgentMarketplaceSubmissionActionData,
  AgentMarketplaceSubmissionFormErrors,
  AgentMarketplaceSubmissionFormValues,
} from "@/types/agent-marketplace";

const MARKETPLACE_PAGE = {
  en: {
    badge: "Supabase-backed",
    title: "Agent Marketplace",
    subtitle:
      "Submit only your email and repository URL. The rest of the marketplace metadata can be completed by the admin in Supabase.",
    liveTitle: "Approved community agents",
    liveEmptyTitle: "No approved agents yet",
    liveEmptyDescription:
      "The first approved repository will appear here after a quick review.",
    workflowTitle: "Workflow",
    workflow: [
      {
        title: "Submit repository",
        description:
          "Share your email address and a public repository URL.",
      },
      {
        title: "Review in database",
        description:
          "Managers review the submission directly in Supabase and update the review status there.",
      },
      {
        title: "Publish automatically",
        description:
          "Approved submissions show up here without any extra manual publishing step.",
      },
    ],
    formTitle: "Submit your agent",
    formDescription:
      "This form only asks for the minimum. We store the submission in Supabase as pending, and the admin fills in the rest later.",
    successTitle: "Submission received",
    successDescription:
      "Your repository has been added to the review queue. The admin can complete the details in Supabase before approving it.",
    formFields: {
      repositoryUrl: "Repository URL",
      submitterEmail: "Email",
    },
    placeholders: {
      repositoryUrl: "https://github.com/your-org/incident-agent",
      submitterEmail: "jane@example.com",
    },
    categoryLabels: {
      development: "Development",
      documentation: "Documentation",
      maintenance: "Maintenance",
      testing: "Testing",
    },
    helper: {
      repositoryUrl: "Public GitHub, GitLab, or any public code repository URL.",
    },
    buttons: {
      submit: "Submit for review",
      submitting: "Submitting...",
      repo: "Repository",
      homepage: "Homepage",
      demo: "Demo",
    },
    reviewBadge: "Approved",
    maintainerLabel: "Maintainer",
    approvedAtLabel: "Approved",
    errors: {
      invalidIntent: "Unsupported form action.",
      repositoryUrl: "Please provide a valid public repository URL.",
      submitterEmail: "Please provide a valid email address.",
      duplicate:
        "This repository has already been submitted. We will review the existing entry.",
      unknown: "We could not save your submission. Please try again.",
    },
  },
  zh: {
    badge: "Supabase 驱动",
    title: "Agent 社区资源",
    subtitle:
      "用户提交时只需要填写邮箱和仓库链接，剩余信息由管理员在 Supabase 中补充并审核。",
    liveTitle: "已通过审核的社区 Agent",
    liveEmptyTitle: "暂时还没有已通过的 Agent",
    liveEmptyDescription:
      "第一个审核通过的仓库会直接展示在这里。",
    workflowTitle: "流程",
    workflow: [
      {
        title: "提交代码仓库",
        description:
          "只填写邮箱和公开代码仓库地址即可。",
      },
      {
        title: "在数据库中审核",
        description:
          "管理员直接在 Supabase 后台查看提交记录，并手动修改审核状态。",
      },
      {
        title: "自动公开展示",
        description:
          "一旦审核通过，这条记录会自动出现在当前社区资源页，不需要额外发布操作。",
      },
    ],
    formTitle: "提交你的 Agent",
    formDescription:
      "这里只收最少信息。记录会先写入 Supabase，剩下的展示信息由管理员后续补全。",
    successTitle: "提交成功",
    successDescription:
      "你的仓库已经进入审核队列，管理员会在 Supabase 中补充信息并完成审核。",
    formFields: {
      repositoryUrl: "代码仓库地址",
      submitterEmail: "邮箱",
    },
    placeholders: {
      repositoryUrl: "https://github.com/your-org/incident-agent",
      submitterEmail: "zhangsan@example.com",
    },
    categoryLabels: {
      development: "开发",
      documentation: "文档",
      maintenance: "维护",
      testing: "测试",
    },
    helper: {
      repositoryUrl: "支持 GitHub、GitLab 或任意公开代码仓库链接。",
    },
    buttons: {
      submit: "提交审核",
      submitting: "提交中...",
      repo: "仓库",
      homepage: "主页",
      demo: "演示",
    },
    reviewBadge: "已通过审核",
    maintainerLabel: "维护者",
    approvedAtLabel: "通过时间",
    errors: {
      invalidIntent: "不支持的表单动作。",
      repositoryUrl: "请填写有效的公开代码仓库地址。",
      submitterEmail: "请填写有效的邮箱地址。",
      duplicate: "这个仓库已经提交过了，我们会继续审核已有记录。",
      unknown: "提交保存失败，请稍后重试。",
    },
  },
} as const;

type MarketplaceLang = keyof typeof MARKETPLACE_PAGE;

const FIELD_CLASS_NAME =
  "mt-2 min-h-11 w-full rounded-[16px] border border-[#E7E7EB] bg-[#FAFAFA] px-4 py-3 text-sm text-[#111113] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#111113]";

function createEmptyFormValues(): AgentMarketplaceSubmissionFormValues {
  return {
    repositoryUrl: "",
    submitterEmail: "",
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getLangFromPathname(pathname: string): MarketplaceLang {
  return pathname.startsWith("/zh/") || pathname === "/zh" ? "zh" : "en";
}

function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * 从仓库地址提取默认 Agent 名称。
 */
function deriveAgentNameFromRepositoryUrl(repositoryUrl: string) {
  try {
    const url = new URL(repositoryUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const repositoryName = segments.at(-1) ?? "community-agent";
    return repositoryName.slice(0, 80);
  } catch {
    return "community-agent";
  }
}

/**
 * 从邮箱生成默认提交者名称。
 */
function deriveSubmitterNameFromEmail(email: string) {
  return (email.split("@")[0] || "community-submitter").slice(0, 80);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const isZh = loaderData?.lang === "zh";
  const title = isZh ? "Downcity — Agent 社区资源" : "Downcity — Agent Marketplace";
  const description = isZh
    ? "提交 Agent 代码仓库，进入 Supabase 审核流程，并在通过后显示到社区资源页。"
    : "Submit agent repositories into a Supabase review queue and publish approved community agents automatically.";

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lang = getLangFromPathname(url.pathname);
  const approvedAgents = await listApprovedAgentMarketplaceSubmissions();

  return {
    lang,
    approvedAgents,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const lang = getLangFromPathname(url.pathname);
  const content = MARKETPLACE_PAGE[lang];
  const formData = await request.formData();
  const intent = normalizeTextInput(formData.get("intent"));

  const values: AgentMarketplaceSubmissionFormValues = {
    repositoryUrl: normalizeTextInput(formData.get("repositoryUrl")),
    submitterEmail: normalizeTextInput(formData.get("submitterEmail")),
  };

  if (intent !== "submit") {
    return data<AgentMarketplaceSubmissionActionData>(
      {
        ok: false,
        errors: { form: content.errors.invalidIntent },
        values,
      },
      { status: 400 },
    );
  }

  const errors: AgentMarketplaceSubmissionFormErrors = {};

  let normalizedRepositoryUrl = "";
  try {
    normalizedRepositoryUrl = normalizeRepositoryUrl(values.repositoryUrl);
  } catch {
    errors.repositoryUrl = content.errors.repositoryUrl;
  }

  if (!isValidEmail(values.submitterEmail)) {
    errors.submitterEmail = content.errors.submitterEmail;
  }

  if (Object.keys(errors).length > 0) {
    return data<AgentMarketplaceSubmissionActionData>(
      { ok: false, errors, values },
      { status: 400 },
    );
  }

  const existing =
    await findAgentMarketplaceSubmissionByNormalizedRepositoryUrl(
      normalizedRepositoryUrl,
    );
  if (existing) {
    return data<AgentMarketplaceSubmissionActionData>(
      {
        ok: false,
        errors: { form: content.errors.duplicate },
        values,
      },
      { status: 409 },
    );
  }

  try {
    const derivedAgentName = deriveAgentNameFromRepositoryUrl(normalizedRepositoryUrl);
    const derivedSubmitterName = deriveSubmitterNameFromEmail(values.submitterEmail);

    await createAgentMarketplaceSubmission({
      agentName: derivedAgentName,
      repositoryUrl: normalizedRepositoryUrl,
      normalizedRepositoryUrl,
      description: "Pending admin review. Marketplace metadata will be completed in Supabase.",
      category: "development",
      submitterName: derivedSubmitterName,
      submitterEmail: values.submitterEmail,
      homepageUrl: null,
      demoUrl: null,
    });
  } catch {
    return data<AgentMarketplaceSubmissionActionData>(
      {
        ok: false,
        errors: { form: content.errors.unknown },
        values,
      },
      { status: 500 },
    );
  }

  url.searchParams.set("submitted", "1");
  return redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export default function Marketplace({
  loaderData,
}: Route.ComponentProps) {
  const actionData =
    useActionData<typeof action>() as AgentMarketplaceSubmissionActionData | undefined;
  const navigation = useNavigation();
  const location = useLocation();
  const content = MARKETPLACE_PAGE[loaderData.lang];
  const formValues = actionData?.values ?? createEmptyFormValues();
  const formErrors = actionData?.errors;
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "submit";
  const submitted = new URLSearchParams(location.search).get("submitted") === "1";

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>{content.badge}</span>
        <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
        <p className={marketingTheme.lead}>{content.subtitle}</p>
      </header>

      {submitted ? (
        <section className="mt-8 rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-5 text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">{content.successTitle}</h2>
              <p className="mt-1 text-sm leading-7 text-emerald-900/80">
                {content.successDescription}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {content.workflow.map((item, index) => (
          <article key={item.title} className={`${marketingTheme.panel} p-5`}>
            <p className={marketingTheme.eyebrow}>
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {item.description}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className={`${marketingTheme.panel} p-6`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className={marketingTheme.sectionTitle}>{content.liveTitle}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {content.workflow[2].description}
              </p>
            </div>
            <span className={marketingTheme.badge}>
              {loaderData.approvedAgents.length}
            </span>
          </div>

          {loaderData.approvedAgents.length === 0 ? (
            <div className={`${marketingTheme.panelSoft} mt-6 p-5`}>
              <h3 className="text-base font-semibold">{content.liveEmptyTitle}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {content.liveEmptyDescription}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {loaderData.approvedAgents.map((agent) => (
                <article key={agent.id} className={`${marketingTheme.panelSoft} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {agent.agentName}
                        </h3>
                        <span className={marketingTheme.badge}>
                          {content.reviewBadge}
                        </span>
                        <span className={marketingTheme.tagSoft}>
                          {
                            content.categoryLabels[
                              agent.category as keyof typeof content.categoryLabels
                            ]
                          }
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                    <ShieldCheck className="size-5 shrink-0 text-foreground/72" />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={agent.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={marketingTheme.primaryButton}
                    >
                      {content.buttons.repo}
                      <ArrowUpRight className="size-4" />
                    </a>
                    {agent.homepageUrl ? (
                      <a
                        href={agent.homepageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={marketingTheme.secondaryButton}
                      >
                        {content.buttons.homepage}
                      </a>
                    ) : null}
                    {agent.demoUrl ? (
                      <a
                        href={agent.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={marketingTheme.secondaryButton}
                      >
                        {content.buttons.demo}
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <span>
                      {content.maintainerLabel}: {agent.submitterName}
                    </span>
                    {formatDisplayDate(agent.approvedAt) ? (
                      <span>
                        {content.approvedAtLabel}: {formatDisplayDate(agent.approvedAt)}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <section className={`${marketingTheme.panel} p-6`}>
            <h2 className="text-xl font-semibold text-foreground">
              {content.formTitle}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {content.formDescription}
            </p>

            {formErrors?.form ? (
              <div className="mt-5 rounded-[18px] border border-red-200 bg-red-50/80 p-4 text-red-950">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p className="text-sm leading-6">{formErrors.form}</p>
                </div>
              </div>
            ) : null}

            <Form method="post" className="mt-6 space-y-4">
              <input type="hidden" name="intent" value="submit" />

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.repositoryUrl}
                </span>
                <input
                  name="repositoryUrl"
                  defaultValue={formValues.repositoryUrl}
                  className={FIELD_CLASS_NAME}
                  placeholder={content.placeholders.repositoryUrl}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {content.helper.repositoryUrl}
                </p>
                {formErrors?.repositoryUrl ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.repositoryUrl}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.submitterEmail}
                </span>
                <input
                  name="submitterEmail"
                  type="email"
                  defaultValue={formValues.submitterEmail}
                  className={FIELD_CLASS_NAME}
                  placeholder={content.placeholders.submitterEmail}
                />
                {formErrors?.submitterEmail ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.submitterEmail}</p>
                ) : null}
              </label>

              <button type="submit" className={marketingTheme.primaryButton} disabled={isSubmitting}>
                {isSubmitting ? content.buttons.submitting : content.buttons.submit}
              </button>
            </Form>
          </section>
        </div>
      </section>
    </div>
  );
}
