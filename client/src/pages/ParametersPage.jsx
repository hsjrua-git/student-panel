import ChangeHistory from '../components/ChangeHistory.jsx';
import ParameterForm from '../components/ParameterForm.jsx';
import ParametersTable from '../components/ParametersTable.jsx';

function ParametersPage() {
  return (
    <main>
      <h1>Parameters</h1>
      <p className="hint">
        A parameter is something you evaluate, like Speed or Rhythm. Which
        parameters each period uses comes from the change history at the
        bottom. Adding a parameter records its first change: "added from this
        period on".
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