export default function Footer() {
  return (
    <footer
      className="shrink-0 w-full flex items-center justify-center gap-2 select-none"
      style={{
        height: 36,
        background: '#fff',
        borderTop: '1px solid #F1F2F3',
        fontSize: 12,
        color: '#8A8F99',
      }}
    >
      <span>语义 BI Agent · 毕业设计演示项目</span>
      <span style={{ color: '#E2E4E9' }}>|</span>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
        style={{ color: '#8A8F99', textDecoration: 'none' }}
      >
        闽ICP备2026035260号-1
      </a>
    </footer>
  );
}
