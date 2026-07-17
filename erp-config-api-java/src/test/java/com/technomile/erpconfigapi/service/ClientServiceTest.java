package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.dto.ClientDtos.ClientCreateDto;
import com.technomile.erpconfigapi.dto.ClientDtos.ClientUpdateDto;
import com.technomile.erpconfigapi.entity.Client;
import com.technomile.erpconfigapi.repository.ClientRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ClientServiceTest {

    @Mock
    private ClientRepository clientRepository;

    @InjectMocks
    private ClientService clientService;

    @Test
    void listShouldReturnMappedDtos() {
        Client client = mkClient("c1");
        when(clientRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(client)));

        var out = clientService.list(0, 10);

        assertEquals(1, out.size());
        assertEquals("c1", out.getFirst().client_id());
    }

    @Test
    void createShouldFailWhenClientExists() {
        when(clientRepository.existsById("c1")).thenReturn(true);

        AppException ex = assertThrows(AppException.class,
                () -> clientService.create(new ClientCreateDto("c1", "name", true)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldDefaultIsActiveTrue() {
        when(clientRepository.existsById("c1")).thenReturn(false);
        when(clientRepository.save(any(Client.class))).thenAnswer(i -> i.getArgument(0));

        var out = clientService.create(new ClientCreateDto("c1", "name", null));

        assertTrue(out.is_active());
    }

    @Test
    void updateShouldApplyFields() {
        Client existing = mkClient("c1");
        when(clientRepository.findById("c1")).thenReturn(Optional.of(existing));
        when(clientRepository.save(any(Client.class))).thenAnswer(i -> i.getArgument(0));

        var out = clientService.update("c1", new ClientUpdateDto("new-name", false));

        assertEquals("new-name", out.client_name());
        assertFalse(out.is_active());
    }

    @Test
    void deleteShouldRemoveEntity() {
        Client existing = mkClient("c1");
        when(clientRepository.findById("c1")).thenReturn(Optional.of(existing));

        clientService.delete("c1");

        verify(clientRepository).delete(existing);
    }

    @Test
    void getShouldThrowWhenNotFound() {
        when(clientRepository.findById("missing")).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> clientService.get("missing"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void getShouldReturnWhenFound() {
        when(clientRepository.findById("c1")).thenReturn(Optional.of(mkClient("c1")));

        var out = clientService.get("c1");

        assertEquals("c1", out.client_id());
    }

    private Client mkClient(String id) {
        Client client = new Client();
        client.setClientId(id);
        client.setClientName("name");
        client.setIsActive(true);
        client.setCreatedAt(java.time.OffsetDateTime.now());
        return client;
    }
}
