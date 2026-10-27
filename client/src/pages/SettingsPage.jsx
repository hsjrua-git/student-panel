import { useTranslation } from 'react-i18next';

// Settings holds no global period configuration anymore: the school-wide
// period anchor was dropped with the period model, and periods are now
// derived per assignment from its sessions.
function SettingsPage() {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <main>
      <h1>{t('settings.title')}</h1>
      <section className="section-card">
        <h2>{t('settings.periodsTitle')}</h2>
        <p>{t('settings.periodsNowPerAssignment')}</p>
      </section>
    </main>
  );
}

export default SettingsPage;
