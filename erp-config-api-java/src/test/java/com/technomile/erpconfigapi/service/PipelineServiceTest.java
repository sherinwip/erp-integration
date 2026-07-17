package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.dto.PipelineDtos.PipelineCreateDto;
import com.technomile.erpconfigapi.dto.PipelineDtos.PipelineUpdateDto;
import com.technomile.erpconfigapi.entity.Client;
import com.technomile.erpconfigapi.entity.Pipeline;
import com.technomile.erpconfigapi.repository.PipelineRepository;
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
class PipelineServiceTest {

    @Mock
    private PipelineRepository pipelineRepository;
    @Mock
    private ClientService clientService;

    @InjectMocks
    private PipelineService pipelineService;

    @Test
    void createShouldFailForUnsupportedPattern() {
        when(clientService.findEntity("c1")).thenReturn(new Client());

        AppException ex = assertThrows(AppException.class,
                () -> pipelineService.create(new PipelineCreateDto("p1", "c1", null, "SRC", "OBJ", null, "PAT-04", null, null, null, null, null)));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatus());
    }

    @Test
    void createShouldFailWhenPipelineExists() {
        when(clientService.findEntity("c1")).thenReturn(new Client());
        when(pipelineRepository.existsById("p1")).thenReturn(true);

        AppException ex = assertThrows(AppException.class,
                () -> pipelineService.create(new PipelineCreateDto("p1", "c1", null, "SRC", "OBJ", null, "PAT-01", null, null, null, null, null)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldSetDefaults() {
        when(clientService.findEntity("c1")).thenReturn(new Client());
        when(pipelineRepository.existsById("p1")).thenReturn(false);
        when(pipelineRepository.save(any(Pipeline.class))).thenAnswer(i -> {
            Pipeline p = i.getArgument(0);
            p.setCreatedAt(java.time.OffsetDateTime.now());
            p.setUpdatedAt(java.time.OffsetDateTime.now());
            return p;
        });

        var out = pipelineService.create(new PipelineCreateDto("p1", "c1", null, "SRC", "OBJ", null, "PAT-01", null, null, null, null, null));

        assertEquals("1.0", out.version());
        assertEquals("*", out.event_type());
        assertEquals("active", out.status());
        assertEquals(3, out.retry_max_attempts());
    }

    @Test
    void updateShouldValidatePattern() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        when(pipelineRepository.findById("p1")).thenReturn(Optional.of(p));

        AppException ex = assertThrows(AppException.class,
                () -> pipelineService.update("p1", new PipelineUpdateDto(null, null, null, null, "PAT-09", null, null, null, null, null)));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatus());
    }

    @Test
    void listShouldUseClientFilter() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        p.setCreatedAt(java.time.OffsetDateTime.now());
        p.setUpdatedAt(java.time.OffsetDateTime.now());
        when(pipelineRepository.findByClientId("c1")).thenReturn(List.of(p));

        var out = pipelineService.list("c1", 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void listShouldUsePagination() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        p.setCreatedAt(java.time.OffsetDateTime.now());
        p.setUpdatedAt(java.time.OffsetDateTime.now());
        when(pipelineRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(p)));

        var out = pipelineService.list(null, 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void getShouldThrowWhenMissing() {
        when(pipelineRepository.findById("missing")).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> pipelineService.get("missing"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void updateShouldApplyAllFields() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        p.setClientId("c1");
        p.setCreatedAt(java.time.OffsetDateTime.now());
        p.setUpdatedAt(java.time.OffsetDateTime.now());
        when(pipelineRepository.findById("p1")).thenReturn(Optional.of(p));
        when(pipelineRepository.save(any(Pipeline.class))).thenAnswer(i -> i.getArgument(0));

        var out = pipelineService.update("p1", new PipelineUpdateDto("2.0", "SRC2", "OBJ2", "evt", "PAT-01", "inactive", 5, "fixed", 1000, "400,500"));

        assertEquals("2.0", out.version());
        assertEquals("PAT-01", out.pattern_id());
        assertEquals("inactive", out.status());
    }

    @Test
    void deleteShouldRemovePipeline() {
        Pipeline p = new Pipeline();
        p.setPipelineId("p1");
        when(pipelineRepository.findById("p1")).thenReturn(Optional.of(p));

        pipelineService.delete("p1");

        verify(pipelineRepository).delete(p);
    }
}
