import StudentForm from '../components/StudentForm.jsx';
import StudentsTable from '../components/StudentsTable.jsx';

function StudentsPage() {
  return (
    <main>
      <h1>Students</h1>
      <section>
        <h2>Add a student</h2>
        <StudentForm />
      </section>
      <section>
        <h2>All students</h2>
        <StudentsTable />
      </section>
    </main>
  );
}

export default StudentsPage;