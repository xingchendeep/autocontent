export const metadata = {
  title: '服务条款 - AutoContent Pro',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-zinc-900">服务条款</h1>
      <p className="mb-6 text-sm text-zinc-500">最后更新日期：2026 年 3 月 23 日</p>

      <div className="space-y-8 text-sm leading-relaxed text-zinc-700">
        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">1. 服务说明</h2>
          <p>
            AutoContent Pro（以下简称「本服务」）是一款在线内容创作工具，帮助用户将视频脚本、音视频链接或文本内容
            转化为适配抖音、小红书、B站、微博、微信公众号、Twitter/X、LinkedIn、快手、知乎、头条等平台的专属文案。
          </p>
          <p className="mt-2">
            本服务包括网站端和浏览器扩展。使用本服务即表示您同意遵守以下条款。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">2. 账户与注册</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>核心文案生成功能无需注册即可使用（受每日免费额度限制）。</li>
            <li>注册账户可解锁云端历史记录、脚本保存、视频链接提取、文件上传、自定义模板、团队协作及 API 访问等高级功能。</li>
            <li>您有责任妥善保管账户凭证，因账户被盗用产生的行为由您自行承担。</li>
            <li>每位用户仅可注册一个账户，禁止通过多账户规避使用限制。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">3. 订阅与付费</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>本服务提供免费版和付费订阅套餐，具体套餐内容及价格以定价页面为准。</li>
            <li>付费订阅通过 Creem.io 处理支付，支持的支付方式以 Creem.io 提供的为准。</li>
            <li>订阅按周期自动续费，您可随时在控制台取消订阅，取消后当前周期仍可使用至到期。</li>
            <li>因数字内容的特殊性，已生成的文案不支持退款。如遇服务故障导致无法使用，请联系我们处理。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">4. 内容与知识产权</h2>
          <h3 className="mb-2 font-medium text-zinc-800">4.1 您的输入内容</h3>
          <p className="mb-3">
            您提交的视频脚本、URL、上传的音视频文件及文本内容的知识产权归您所有。
            您授权本服务在提供文案生成功能所必需的范围内处理这些内容。
          </p>
          <h3 className="mb-2 font-medium text-zinc-800">4.2 生成的文案</h3>
          <p className="mb-3">
            AI 生成的文案供您自由使用，包括商业用途。但请注意，AI 生成内容可能与他人作品存在相似性，
            您有责任在发布前自行审核，确保不侵犯第三方权利。
          </p>
          <h3 className="mb-2 font-medium text-zinc-800">4.3 服务本身</h3>
          <p>
            本服务的代码、界面设计、品牌标识等知识产权归 AutoContent Pro 所有，未经授权不得复制或仿冒。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">5. 使用规范</h2>
          <p>使用本服务时，您不得：</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>提交违反法律法规的内容（包括但不限于色情、暴力、仇恨言论、恐怖主义相关内容）</li>
            <li>利用本服务生成虚假信息、诈骗内容或垃圾营销文案</li>
            <li>通过自动化手段（脚本、爬虫等）大量调用服务以规避使用限制</li>
            <li>尝试对服务进行逆向工程、破解或未授权访问</li>
            <li>将 API Key 公开分享或转让给第三方</li>
            <li>提交侵犯他人知识产权的内容</li>
          </ul>
          <p className="mt-2">
            违反上述规范的账户可能被暂停或永久封禁，且不予退款。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">6. 浏览器扩展</h2>
          <p>
            AutoContent Pro 浏览器扩展仅在您主动触发时提取当前页面的正文内容，用于文案生成。
            扩展不会在后台自动采集浏览数据。使用扩展提取第三方网站内容时，
            请确保您有权使用该内容，本服务不对因此产生的版权纠纷承担责任。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">7. 服务可用性与免责</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>本服务按「现状」提供，不保证 100% 可用性或生成结果的准确性。</li>
            <li>AI 生成的文案仅供参考，发布前请自行审核内容的准确性、合规性和适当性。</li>
            <li>视频链接提取功能依赖第三方平台接口，可能因平台变更而暂时不可用。</li>
            <li>因不可抗力（网络故障、第三方服务中断等）导致的服务中断，本服务不承担赔偿责任。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">8. 团队功能</h2>
          <p>
            付费套餐中的团队功能允许您邀请成员共享使用额度。团队创建者对团队成员的行为承担管理责任。
            团队成员的使用量计入团队总额度。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">9. 条款变更</h2>
          <p>
            我们可能会不时修改本服务条款。重大变更将通过网站公告或邮件通知。
            变更生效后继续使用本服务即表示您同意修改后的条款。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-900">10. 联系方式</h2>
          <p>
            如果您对本服务条款有任何疑问，请通过电子邮件联系我们：
            <a href="mailto:zixingwenhua2024@outlook.com" className="text-blue-600 hover:underline">zixingwenhua2024@outlook.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
