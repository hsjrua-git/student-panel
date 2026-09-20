import { useAuth } from '../auth/AuthContext.jsx';
import ChangeHistory from '../components/ChangeHistory.jsx';
import ParameterForm from '../components/ParameterForm.jsx';
import ParametersTable from '../components/ParametersTable.jsx';

function ParametersPage() {
  const { can } = useAuth();

  return (
    <main>
      <h1>Parameters</h1>
      <p className="hint">
        A parameter is something you evaluate, like Speed or Rhythm. Which
        parameters each period uses comes from the change history at the
        bottom.
        {can('admin') ? '' : ' Only administrators can change them.'}
      </p>

      {can('admin') && (
        <section>
          <h2>Add a parameter</h2>
          <ParameterForm />
        </section>
      )}

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