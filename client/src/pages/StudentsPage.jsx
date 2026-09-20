import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import StudentForm from '../components/StudentForm.jsx';
import StudentsTable from '../components/StudentsTable.jsx';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

function StudentsPage() {
  const { can } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchText.trim(), 300);

  function handleSearchChange(event) {
    setSearchText(event.target.value);
    setPage(1);
  }

  return (
    <main>
      <h1>Students</h1>
      {can('staff') && (
        <section>
          <h2>Add a student</h2>
          <StudentForm />
        </section>
      )}
      <section>
        <h2>All students</h2>
        <input
          type="search"
          className="search"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Search by name or code"
          aria-label="Search students"
        />
        <StudentsTable search={search} page={page} onPageChange={setPage} />
      </section>
    </main>
  );
}

export default StudentsPage;