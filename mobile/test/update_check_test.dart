import 'package:flutter_test/flutter_test.dart';
import 'package:iteary_mobile/services/update_check.dart';

void main() {
  group('a release is newer than what is installed', () {
    test('plain increments', () {
      expect(UpdateCheck.isNewer('1.0.1', '1.0.0'), isTrue);
      expect(UpdateCheck.isNewer('1.1.0', '1.0.9'), isTrue);
      expect(UpdateCheck.isNewer('2.0.0', '1.9.9'), isTrue);
    });

    test('the same version is not an update', () {
      expect(UpdateCheck.isNewer('1.0.0', '1.0.0'), isFalse);
      expect(UpdateCheck.isNewer('v1.0.0', '1.0.0'), isFalse);
    });

    test('older is never offered', () {
      expect(UpdateCheck.isNewer('1.0.0', '1.0.1'), isFalse);
      expect(UpdateCheck.isNewer('1.9.0', '2.0.0'), isFalse);
    });

    test('a v prefix and a build number are ignored', () {
      expect(UpdateCheck.isNewer('v1.2.0', '1.1.0+7'), isTrue);
      expect(UpdateCheck.isNewer('V1.0.0+9', '1.0.0+2'), isFalse);
    });

    test('ten sorts above nine, which string comparison gets wrong', () {
      expect(UpdateCheck.isNewer('1.10.0', '1.9.0'), isTrue);
      expect(UpdateCheck.isNewer('1.9.0', '1.10.0'), isFalse);
    });

    test('uneven lengths compare as if padded with zeroes', () {
      expect(UpdateCheck.isNewer('1.1', '1.0.9'), isTrue);
      expect(UpdateCheck.isNewer('1.0', '1.0.0'), isFalse);
      expect(UpdateCheck.isNewer('1.0.0.1', '1.0.0'), isTrue);
    });

    test('junk does not crash and does not claim an update', () {
      expect(UpdateCheck.isNewer('', '1.0.0'), isFalse);
      expect(UpdateCheck.isNewer('banana', '1.0.0'), isFalse);
    });
  });
}
