import 'package:flutter_test/flutter_test.dart';
import 'package:iteary_mobile/models/models.dart';
import 'package:iteary_mobile/diner/screens/ticket_screen.dart';
import 'package:iteary_mobile/diner/state/cart.dart';

const _tapsilog = Dish(
  id: 'tapsilog',
  name: 'Tapsilog',
  tagalog: 'Tapa • Sinangag • Itlog',
  price: 75,
  category: 'Silog',
  description: '',
  image: '',
  available: true,
);

const _sago = Dish(
  id: 'sago',
  name: "Sago't Gulaman",
  tagalog: '',
  price: 25,
  category: 'Inumin',
  description: '',
  image: '',
  available: true,
);

void main() {
  group('Cart', () {
    test('starts empty', () {
      final cart = Cart();
      expect(cart.isEmpty, isTrue);
      expect(cart.itemCount, 0);
      expect(cart.estimatedTotal, 0);
    });

    test('adding the same dish twice increments its quantity', () {
      final cart = Cart()
        ..add(_tapsilog)
        ..add(_tapsilog);
      expect(cart.qtyOf('tapsilog'), 2);
      expect(cart.itemCount, 2);
      expect(cart.lines.length, 1);
    });

    test('estimates the total across different dishes', () {
      final cart = Cart()
        ..add(_tapsilog)
        ..add(_sago)
        ..add(_sago);
      expect(cart.estimatedTotal, 75 + 25 * 2);
    });

    test('removing the last of a dish drops the line entirely', () {
      final cart = Cart()..add(_sago);
      cart.remove('sago');
      expect(cart.qtyOf('sago'), 0);
      expect(cart.isEmpty, isTrue);
      expect(cart.lines, isEmpty);
    });

    test('sends only ids and quantities — never prices', () {
      final cart = Cart()
        ..add(_tapsilog)
        ..add(_sago);
      // The server prices the order; the payload must carry no money at all.
      expect(cart.quantities, {'tapsilog': 1, 'sago': 1});
    });
  });

  group('receipt text', () {
    final ticket = Ticket(
      id: 'abc',
      ticketCode: 'K7M2Q9',
      customerName: 'Jun',
      items: const [
        TicketItem(id: 'tapsilog', name: 'Tapsilog', qty: 1, price: 75),
        TicketItem(id: 'sago', name: "Sago't Gulaman", qty: 2, price: 25),
      ],
      total: 125,
      paymentMethod: 'cash',
      paymentStatus: 'verified',
      proofPath: null,
      status: 'paid',
      paidAt: DateTime(2026, 8, 3, 19, 24),
      createdAt: DateTime(2026, 8, 3, 19, 20),
    );

    test('includes the ticket code, items and total', () {
      final text = buildReceiptText(ticket);
      expect(text, contains('K7M2Q9'));
      expect(text, contains('1 x Tapsilog'));
      expect(text, contains("2 x Sago't Gulaman"));
      expect(text, contains('125.00'));
      expect(text, contains('Jun'));
      expect(text, contains('Cash'));
    });

    test('every line fits the 32-column thermal roll', () {
      for (final line in buildReceiptText(ticket).split('\n')) {
        expect(line.length, lessThanOrEqualTo(32), reason: 'too wide: "$line"');
      }
    });

    test('an unsettled ticket reads as Unpaid', () {
      final unpaid = Ticket(
        id: 'x',
        ticketCode: 'AAA111',
        customerName: null,
        items: const [TicketItem(id: 'sago', name: 'Sago', qty: 1, price: 25)],
        total: 25,
        paymentMethod: 'gcash',
        paymentStatus: 'unpaid',
        proofPath: null,
        status: 'pending',
        paidAt: null,
        createdAt: DateTime(2026, 8, 3, 19, 20),
      );
      expect(unpaid.isPaid, isFalse);
      // paymentLabel names the chosen METHOD; the receipt has to say out loud
      // that the money hasn't arrived yet, or "GCash" reads as though it has.
      expect(unpaid.paymentLabel, 'GCash');
      expect(unpaid.receiptPaymentLabel, 'GCash (UNPAID)');
      expect(buildReceiptText(unpaid), contains('UNPAID'));
    });

    test('a flagged payment says it is still being confirmed', () {
      final flagged = Ticket(
        id: 'y',
        ticketCode: 'BBB222',
        customerName: null,
        items: const [TicketItem(id: 'sago', name: 'Sago', qty: 1, price: 25)],
        total: 25,
        paymentMethod: 'gcash',
        paymentStatus: 'needs_review',
        proofPath: null,
        status: 'paid',
        paidAt: DateTime(2026, 8, 3, 19, 30),
        createdAt: DateTime(2026, 8, 3, 19, 20),
      );
      expect(flagged.receiptPaymentLabel, 'GCash (confirming)');
      expect(flagged.reviewNotice, isNotNull);
    });

    test('a GCash ticket with no screenshot is flagged as needing one', () {
      final awaiting = Ticket(
        id: 'z',
        ticketCode: 'CCC333',
        customerName: null,
        items: const [TicketItem(id: 'sago', name: 'Sago', qty: 1, price: 25)],
        total: 25,
        paymentMethod: 'gcash',
        paymentStatus: 'unpaid',
        proofPath: null,
        status: 'pending',
        paidAt: null,
        createdAt: DateTime(2026, 8, 3, 19, 20),
      );
      expect(awaiting.needsProof, isTrue);
      expect(awaiting.statusLabel, contains('upload'));

      final withProof = Ticket(
        id: 'z2',
        ticketCode: 'CCC334',
        customerName: null,
        items: const [TicketItem(id: 'sago', name: 'Sago', qty: 1, price: 25)],
        total: 25,
        paymentMethod: 'gcash',
        paymentStatus: 'unpaid',
        proofPath: 'CCC334/abc.jpg',
        status: 'pending',
        paidAt: null,
        createdAt: DateTime(2026, 8, 3, 19, 20),
      );
      expect(withProof.needsProof, isFalse);

      // Cash never asks for a screenshot.
      final cash = Ticket(
        id: 'z3',
        ticketCode: 'CCC335',
        customerName: null,
        items: const [TicketItem(id: 'sago', name: 'Sago', qty: 1, price: 25)],
        total: 25,
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        proofPath: null,
        status: 'pending',
        paidAt: null,
        createdAt: DateTime(2026, 8, 3, 19, 20),
      );
      expect(cash.needsProof, isFalse);
    });
  });
}
