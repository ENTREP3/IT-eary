import 'bootstrap.dart';
import 'staff/sign_in_screen.dart';
import 'staff/staff_entry.dart';

/// The **cashier** app — its own build, its own install, its own icon.
///
///   flutter run -t lib/main_cashier.dart
///
/// Only the counter. There is no route from here to the owner dashboard, so a
/// cashier's device never carries it.
Future<void> main() => bootstrap(
      const StaffEntry(area: StaffArea.cashier, title: 'IT-eary Counter'),
    );
