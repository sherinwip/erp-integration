package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.dto.TargetDtos.TargetCreateDto;
import com.technomile.erpconfigapi.dto.TargetDtos.TargetUpdateDto;
import com.technomile.erpconfigapi.entity.Client;
import com.technomile.erpconfigapi.entity.Target;
import com.technomile.erpconfigapi.repository.TargetRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TargetServiceTest {

    @Mock
    private TargetRepository targetRepository;
    @Mock
    private ClientService clientService;

    @InjectMocks
    private TargetService targetService;

    @Test
    void listWithClientShouldUseClientFilter() {
        when(targetRepository.findByClientId("c1")).thenReturn(List.of(mkTarget("t1", "c1")));

        var out = targetService.list("c1", 0, 10);

        assertEquals(1, out.size());
        verify(targetRepository).findByClientId("c1");
    }

    @Test
    void listWithoutClientShouldUsePagination() {
        when(targetRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(mkTarget("t1", "c1"))));

        var out = targetService.list(null, 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void createShouldFailWhenTargetExists() {
        when(targetRepository.existsById("t1")).thenReturn(true);

        AppException ex = assertThrows(AppException.class,
                () -> targetService.create(new TargetCreateDto("t1", "c1", "name", "url", "oauth2", "cred", Map.of(), true)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldFailWhenDuplicateTargetNamePerClient() {
        when(targetRepository.existsById("t1")).thenReturn(false);
        when(targetRepository.findByClientIdAndTargetName("c1", "name")).thenReturn(Optional.of(mkTarget("t2", "c1")));

        AppException ex = assertThrows(AppException.class,
                () -> targetService.create(new TargetCreateDto("t1", "c1", "name", "url", "oauth2", "cred", Map.of(), true)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldSetDefaults() {
        when(targetRepository.existsById("t1")).thenReturn(false);
        when(targetRepository.findByClientIdAndTargetName("c1", "name")).thenReturn(Optional.empty());
        when(targetRepository.save(any(Target.class))).thenAnswer(i -> i.getArgument(0));
        Client c = new Client();
        c.setClientId("c1");
        when(clientService.findEntity("c1")).thenReturn(c);

        var out = targetService.create(new TargetCreateDto("t1", "c1", "name", "url", "oauth2", "cred", null, null));

        assertTrue(out.is_active());
        assertEquals(Map.of(), out.default_headers());
    }

    @Test
    void updateShouldApplyFields() {
        Target t = mkTarget("t1", "c1");
        when(targetRepository.findById("t1")).thenReturn(Optional.of(t));
        when(targetRepository.save(any(Target.class))).thenAnswer(i -> i.getArgument(0));

        var out = targetService.update("t1", new TargetUpdateDto("n2", "u2", "basic", "c2", Map.of("k", "v"), false));

        assertEquals("n2", out.target_name());
        assertFalse(out.is_active());
    }

    @Test
    void getShouldReturnValue() {
        when(targetRepository.findById("t1")).thenReturn(Optional.of(mkTarget("t1", "c1")));

        var out = targetService.get("t1");

        assertEquals("t1", out.target_id());
    }

    @Test
    void getShouldThrowWhenNotFound() {
        when(targetRepository.findById("missing")).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> targetService.get("missing"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void deleteShouldRemoveTarget() {
        Target t = mkTarget("t1", "c1");
        when(targetRepository.findById("t1")).thenReturn(Optional.of(t));

        targetService.delete("t1");

        verify(targetRepository).delete(t);
    }

    private Target mkTarget(String id, String clientId) {
        Target t = new Target();
        t.setTargetId(id);
        t.setClientId(clientId);
        t.setTargetName("name");
        t.setBaseUrl("url");
        t.setAuthType("oauth2");
        t.setCredentialRef("cred");
        t.setDefaultHeaders(Map.of());
        t.setIsActive(true);
        t.setUpdatedAt(java.time.OffsetDateTime.now());
        return t;
    }
}
