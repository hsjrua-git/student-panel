import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import ChangeHistory from '../components/ChangeHistory.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ParameterForm from '../components/ParameterForm.jsx';
import ParametersTable from '../components/ParametersTable.jsx';

function ParametersPage() {
  const { t } = useTranslation(['students', 'common']);
  const { can } = useAuth();

  // The Parameters screen is a management surface (add/edit parameters and the
  // period change history). Reading parameter *values* elsewhere only needs
  // parameters.view, but this page is gated on parameters.manage so roles that
  // can merely see scores (Viewer, Staff) don't get a settings-like panel.
  if (!can('parameters.manage')) {
    return (
      <main>
        <h1>{t('parameters.title')}</h1>
        <EmptyState
          title={t('shared.readOnlyTitle')}
          description={t('parameters.readOnlyDescription')}
        />
      </main>
    );
  }

  return (
    <main>
      <h1>{t('parameters.title')}</h1>
      <p className="hint">{t('parameters.hint')}</p>

      <section className="section-card">
        <h2>{t('parameters.addTitle')}</h2>
        <ParameterForm />
      </section>

      <section className="section-card">
        <h2>{t('parameters.allTitle')}</h2>
        <ParametersTable />
      </section>

      <section className="section-card">
        <h2>{t('parameters.changeHistoryTitle')}</h2>
        <ChangeHistory />
      </section>
    </main>
  );
}

export default ParametersPage;