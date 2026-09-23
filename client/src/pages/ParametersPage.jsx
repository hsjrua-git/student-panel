import { useAuth } from '../auth/AuthContext.jsx';
import ChangeHistory from '../components/ChangeHistory.jsx';
import ParameterForm from '../components/ParameterForm.jsx';
import ParametersTable from '../components/ParametersTable.jsx';

function ParametersPage() {
  const { can } = useAuth();

  // The Parameters screen is a management surface (add/edit parameters and the
  // period change history). Reading parameter *values* elsewhere only needs
  // parameters.view, but this page is gated on parameters.manage so roles that
  // can merely see scores (Viewer, Staff) don't get a settings-like panel.
  if (!can('parameters.manage')) {
    return (
      <main>
        <h1>Parameters</h1>
        <p>You do not have permission to manage parameters.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Parameters</h1>
      <p className="hint">
        A parameter is something you evaluate, like Speed or Rhythm. Which
        parameters each period uses comes from the change history at the bottom.
      </p>

      <section>
        <h2>Add a parameter</h2>
        <ParameterForm />
      </section>

      <section>
        <h2>All parameters</h2>
        <ParametersTable />
      </section>

      <section>
        <h2>Change history</h2>
        <ChangeHistory />
      </section>
    </main>
  );
}

export default ParametersPage;