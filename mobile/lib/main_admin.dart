import 'bootstrap.dart';
import 'staff/sign_in_screen.dart';
import 'staff/staff_entry.dart';

/// The **owner** app — sales, kitchen, stock, menu and payments.
///
///   flutter run -t lib/main_admin.dart
///
/// A cashier account is rejected at sign-in here, and the database refuses the
/// same data regardless of which build is asking.
Future<void> main() => bootstrap(
      const StaffEntry(area: StaffArea.admin, title: 'Bencris Operations'),
    );
